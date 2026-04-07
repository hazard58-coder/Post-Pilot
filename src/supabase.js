// ─────────────────────────────────────────────────────────────
// Lightweight Supabase Client — no SDK dependency
// Handles Auth, DB (PostgREST), and session management
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL     = window.__ENV__?.SUPABASE_URL     || '';
const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY || '';
const SESSION_KEY      = 'pp_session';

class SupabaseClient {
  constructor(url, key) {
    this.url          = url;
    this.key          = key;
    this.accessToken  = null;
    this.refreshToken = null;
    this.user         = null;
    this.listeners    = new Set();
  }

  get configured() {
    return this.url && this.key && !this.url.includes('YOUR_PROJECT');
  }

  headers() {
    const h = { 'Content-Type': 'application/json', apikey: this.key };
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    return h;
  }

  subscribe(fn)  { this.listeners.add(fn);    return () => this.listeners.delete(fn); }
  notify(ev, s)  { this.listeners.forEach(fn => fn(ev, s)); }

  // ── AUTH ─────────────────────────────────────────────────────

  async signUp(email, password, displayName) {
    const res = await fetch(`${this.url}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email, password, data: { display_name: displayName } }),
    });
    const data = await res.json();
    if (data.error || data.msg) throw new Error(data.error?.message || data.msg || 'Sign up failed');
    if (data.access_token) { this.setSession(data); return { user: data.user, confirmEmail: false }; }
    return { user: data.user || data, confirmEmail: true };
  }

  async signIn(email, password) {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error || data.error_description)
      throw new Error(data.error_description || data.error || 'Sign in failed');
    this.setSession(data);
    return { user: data.user };
  }

  async signOut() {
    try { await fetch(`${this.url}/auth/v1/logout`, { method: 'POST', headers: this.headers() }); } catch {}
    this.accessToken = null; this.refreshToken = null; this.user = null;
    localStorage.removeItem(SESSION_KEY);
    this.notify('SIGNED_OUT', null);
  }

  setSession(data) {
    this.accessToken  = data.access_token;
    this.refreshToken = data.refresh_token;
    this.user         = data.user;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: data.access_token, refresh_token: data.refresh_token, user: data.user,
    }));
    this.notify('SIGNED_IN', data);
  }

  async restoreSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const stored = JSON.parse(raw);
      this.accessToken = stored.access_token; this.refreshToken = stored.refresh_token; this.user = stored.user;
      const res = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.key },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      const data = await res.json();
      if (data.access_token) { this.setSession(data); return data; }
      this.signOut(); return null;
    } catch { this.signOut(); return null; }
  }

  async resetPassword(email) {
    const res = await fetch(`${this.url}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.key },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.msg || 'Reset failed'); }
  }

  // ── DB (PostgREST) ───────────────────────────────────────────

  async query(table, { select = '*', filters = [], order, limit } = {}) {
    let url = `${this.url}/rest/v1/${table}?select=${select}`;
    filters.forEach(([col, op, val]) => (url += `&${col}=${op}.${val}`));
    if (order) url += `&order=${order}`;
    if (limit)  url += `&limit=${limit}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Query failed: ${res.statusText}`);
    return res.json();
  }

  async insert(table, rows) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.headers(), Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Insert failed'); }
    return res.json();
  }

  async update(table, id, data) {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...this.headers(), Prefer: 'return=representation' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Update failed');
    return res.json();
  }

  async delete(table, id) {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE', headers: this.headers(),
    });
    if (!res.ok) throw new Error('Delete failed');
  }

  // ── REALTIME (polling fallback) ──────────────────────────────

  subscribeToTable(table, callback, intervalMs = 5000) {
    const poll = async () => {
      try { const data = await this.query(table, { order: 'created_at.desc', limit: 200 }); callback(data); } catch {}
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }
}

export const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
