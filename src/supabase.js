// ─────────────────────────────────────────────────────────────
// Lightweight Supabase Client — no SDK dependency
// Handles Auth, DB (PostgREST), and session management
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const SESSION_KEY       = 'pp_session';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES        = 2;

// ── Helpers ──────────────────────────────────────────────────

/**
 * fetch() wrapped with an AbortController timeout.
 * Throws a descriptive error on timeout instead of hanging.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 12 seconds');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry a fetch operation on transient 5xx / network errors.
 * Does NOT retry 4xx (auth/validation failures should surface immediately).
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);
      // Retry on server errors; surface client errors immediately
      if (res.status >= 500 && attempt < retries) {
        await delay(300 * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      // Retry on network / timeout errors
      if (attempt < retries) {
        await delay(300 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

/** Validate that a value looks like a UUID to prevent path injection. */
function assertUUID(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid record ID format: ${id}`);
  }
}

// ─────────────────────────────────────────────────────────────

class SupabaseClient {
  constructor(url, key) {
    this.url           = url;
    this.key           = key;
    this.accessToken   = null;
    this.refreshToken  = null;
    this.user          = null;
    this.listeners     = new Set();
    this._refreshTimer = null;
  }

  get configured() {
    return !!(this.url && this.key && !this.url.includes('YOUR_PROJECT'));
  }

  headers() {
    const h = { 'Content-Type': 'application/json', apikey: this.key };
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    return h;
  }

  subscribe(fn)    { this.listeners.add(fn);            return () => this.listeners.delete(fn); }
  _notify(ev, s)   { this.listeners.forEach(fn => fn(ev, s)); }

  // ── AUTH ─────────────────────────────────────────────────────

  async signUp(email, password, displayName) {
    const res = await fetchWithRetry(`${this.url}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email, password, data: { display_name: displayName } }),
    });
    const data = await res.json();
    if (!res.ok || data.error || data.msg) {
      throw new Error(data.error?.message || data.msg || 'Sign up failed');
    }
    if (data.access_token) {
      this._setSession(data);
      return { user: data.user, confirmEmail: false };
    }
    return { user: data.user || data, confirmEmail: true };
  }

  async signIn(email, password) {
    const res = await fetchWithRetry(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok || data.error || data.error_description) {
      throw new Error(data.error_description || data.error || 'Sign in failed');
    }
    this._setSession(data);
    return { user: data.user };
  }

  async signOut() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    try {
      await fetchWithTimeout(`${this.url}/auth/v1/logout`, {
        method: 'POST',
        headers: this.headers(),
      });
    } catch {
      // Best-effort logout — clear local state regardless
    }
    this.accessToken  = null;
    this.refreshToken = null;
    this.user         = null;
    localStorage.removeItem(SESSION_KEY);
    this._notify('SIGNED_OUT', null);
  }

  _setSession(data) {
    this.accessToken  = data.access_token;
    this.refreshToken = data.refresh_token;
    this.user         = data.user;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      user:          data.user,
      expires_in:    data.expires_in,
    }));
    this._notify('SIGNED_IN', data);
    // Schedule proactive token refresh 60s before expiry (min 10s)
    if (data.expires_in) {
      this._scheduleRefresh(data.expires_in);
    }
  }

  _scheduleRefresh(expiresIn) {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    const delayMs = Math.max(10_000, (expiresIn - 60) * 1_000);
    this._refreshTimer = setTimeout(async () => {
      try {
        if (this.refreshToken) await this._doTokenRefresh();
      } catch {
        // Refresh failed — session has expired; sign out cleanly
        await this.signOut();
      }
    }, delayMs);
  }

  async _doTokenRefresh() {
    const res = await fetchWithRetry(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error('Token refresh failed');
    }
    this._setSession(data);
    return data;
  }

  async restoreSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw);
      if (!stored.access_token || !stored.refresh_token) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      this.accessToken  = stored.access_token;
      this.refreshToken = stored.refresh_token;
      this.user         = stored.user;
      return await this._doTokenRefresh();
    } catch {
      // Stored session is invalid — clear it and return null (not sign out,
      // which would fire SIGNED_OUT event unnecessarily on page load)
      this.accessToken  = null;
      this.refreshToken = null;
      this.user         = null;
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  async resetPassword(email) {
    const res = await fetchWithRetry(`${this.url}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.msg || d.error_description || 'Password reset failed');
    }
  }

  // ── DB (PostgREST) ───────────────────────────────────────────

  async query(table, { select = '*', filters = [], order, limit } = {}) {
    // Encode table name and all param values to prevent injection
    let url = `${this.url}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(select)}`;
    filters.forEach(([col, op, val]) => {
      url += `&${encodeURIComponent(col)}=${encodeURIComponent(op)}.${encodeURIComponent(val)}`;
    });
    if (order) url += `&order=${encodeURIComponent(order)}`;
    if (limit) url += `&limit=${encodeURIComponent(String(limit))}`;
    const res = await fetchWithRetry(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Query failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async insert(table, rows) {
    const res = await fetchWithRetry(`${this.url}/rest/v1/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { ...this.headers(), Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || e.details || `Insert failed: ${res.status}`);
    }
    return res.json();
  }

  async update(table, id, data) {
    assertUUID(id);
    const res = await fetchWithRetry(
      `${this.url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { ...this.headers(), Prefer: 'return=representation' },
        body: JSON.stringify(data),
      }
    );
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `Update failed: ${res.status}`);
    }
    return res.json();
  }

  async delete(table, id) {
    assertUUID(id);
    const res = await fetchWithRetry(
      `${this.url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: this.headers() }
    );
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `Delete failed: ${res.status}`);
    }
  }

  // ── REALTIME (polling fallback) ──────────────────────────────

  subscribeToTable(table, callback, intervalMs = 8_000) {
    let active = true;
    // Start from now — loadPosts() already fetched everything up to this moment.
    // Using updated_at means edits by other users are also picked up (not just new inserts).
    let lastFetch = new Date().toISOString();

    const poll = async () => {
      if (!active || !this.accessToken) return;
      try {
        const filters = [['updated_at', 'gt', lastFetch]];
        const data = await this.query(table, {
          filters,
          order: 'scheduled_date.asc',
          limit: 500,
        });
        if (active && data) {
          lastFetch = new Date().toISOString();
          callback(data);
        }
      } catch {
        // Polling errors are non-fatal; retry next interval
      }
    };

    // Initial full load is handled by loadPosts(); polling picks up delta changes
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }
}

export const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
