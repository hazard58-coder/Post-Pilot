import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, Component } from 'react';
import { supabase } from './supabase.js';
import {
  PLATFORMS, POST_TYPES, HASHTAG_SETS, BEST_TIMES, CONTENT_CATEGORIES,
  DEMO_COMPANIES, generateId, fmt, fmtTime,
} from './constants.js';
import './App.css';

// ─────────────────────────────────────────────────────────────
// CONTEXTS
// ─────────────────────────────────────────────────────────────
const AuthContext    = createContext(null);
const useAuth        = () => useContext(AuthContext);
const CompanyContext = createContext(null);
const useCompany     = () => useContext(CompanyContext);

// ─────────────────────────────────────────────────────────────
// ADMIN CREDENTIALS
// ⚠ SECURITY: Remove this entire section for production.
// Admin access should be handled server-side via Supabase service role.
// ─────────────────────────────────────────────────────────────
const ADMIN_USERNAME = window.__ENV__?.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = window.__ENV__?.ADMIN_PASSWORD || '';

// Set VITE_DEMO_ENABLED=false in production to hide the "Try Demo" button.
const DEMO_ENABLED   = window.__ENV__?.DEMO_ENABLED !== 'false';

// ─────────────────────────────────────────────────────────────
// PURE HELPERS  (defined outside components — not re-created on render)
// ─────────────────────────────────────────────────────────────
const postToDb = (post, userId, companyId) => ({
  id:             post.id,
  user_id:        userId,
  content:        post.content,
  platforms:      post.platforms,
  scheduled_date: post.scheduledDate,
  status:         post.status,
  post_type:      post.postType,
  hashtags:       post.hashtags,
  engagement:     post.engagement,
  media_urls:     post.mediaUrls  || [],
  category:       post.category   || '',
  company_id:     post.companyId  || companyId,
  per_network:    post.perNetwork || {},
});

const dbToPost = (r, fallbackCompanyId) => ({
  id:            r.id,
  content:       r.content,
  platforms:     r.platforms     || [],
  scheduledDate: r.scheduled_date,
  status:        r.status,
  postType:      r.post_type,
  hashtags:      r.hashtags      || [],
  engagement:    r.engagement,
  category:      r.category      || '',
  mediaUrls:     r.media_urls    || [],
  perNetwork:    r.per_network   || {},
  createdBy:     r.user_id,
  companyId:     r.company_id    || fallbackCompanyId,
});

/**
 * Strip the appended hashtag suffix from stored content when loading a post
 * for editing. On save, hashtags are appended as "\n\n#tag1 #tag2"; on re-load
 * both the content textarea AND the hashtags field would be pre-filled,
 * causing them to double on every subsequent save.
 */
const stripHashtagSuffix = (content, hashtags) => {
  if (!hashtags?.length) return content;
  const suffix = '\n\n' + hashtags.join(' ');
  return content.endsWith(suffix) ? content.slice(0, -suffix.length) : content;
};

const isValidEmail = email =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).toLowerCase().trim());

/** RFC-4180 compliant CSV line parser — handles quoted fields, escaped quotes, empty fields. */
const parseCSVLine = line => {
  const fields = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
};

// ─────────────────────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[PostPilot] Unhandled render error:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:12, padding:20, textAlign:'center' }}>
          <div style={{ fontSize:40 }}>⚠️</div>
          <h2 style={{ fontWeight:700, color:'#0F172A' }}>Something went wrong</h2>
          <p style={{ color:'#64748B', maxWidth:360, lineHeight:1.6 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            style={{ padding:'10px 24px', background:'#1D4ED8', color:'#FFF', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer' }}
            onClick={() => { this.setState({ hasError: false, error: null }); }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
export default function PostPilotApp() {
  const [user,      setUser]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [isAdmin,   setIsAdmin]   = useState(false);

  // ── Company state (persisted to localStorage) ──────────────
  const [companies, setCompanies] = useState(() => {
    try {
      const s = localStorage.getItem('pp_companies');
      return s ? JSON.parse(s) : DEMO_COMPANIES.map(c => ({ ...c }));
    } catch { return DEMO_COMPANIES.map(c => ({ ...c })); }
  });

  const [activeCompanyId, setActiveCompanyId] = useState(
    () => localStorage.getItem('pp_active_co') || DEMO_COMPANIES[0]?.id || ''
  );

  const [userAssignments, setUserAssignments] = useState(() => {
    try {
      const s = localStorage.getItem('pp_user_assignments');
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });

  // Persist to localStorage on change
  useEffect(() => { localStorage.setItem('pp_companies',        JSON.stringify(companies));      }, [companies]);
  useEffect(() => { localStorage.setItem('pp_active_co',        activeCompanyId);                }, [activeCompanyId]);
  useEffect(() => { localStorage.setItem('pp_user_assignments', JSON.stringify(userAssignments));}, [userAssignments]);

  // ── Auth ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = supabase.subscribe((ev, s) => {
      if (ev === 'SIGNED_IN')  setUser(s.user);
      if (ev === 'SIGNED_OUT') { setUser(null); setUsingDemo(false); setIsAdmin(false); }
    });

    if (supabase.configured) {
      supabase.restoreSession()
        .then(s => { if (s?.user) setUser(s.user); })
        .catch(() => { /* expired or no session — proceed as logged out */ })
        .finally(() => setLoading(false)); // always unblock the loader
    } else {
      setLoading(false);
    }

    return unsub;
  }, []);

  // ── Company operations ─────────────────────────────────────
  const addCompany = useCallback(co => setCompanies(prev => [...prev, co]), []);

  const updateCompany = useCallback((id, data) =>
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...data } : c)), []);

  const deleteCompany = useCallback(id => {
    setCompanies(prev => prev.filter(c => c.id !== id));
    setActiveCompanyId(current => {
      if (current !== id) return current;
      const remaining = companies.filter(c => c.id !== id);
      return remaining.length > 0 ? remaining[0].id : current;
    });
    // Remove the deleted company from every user's assignment list so stale
    // IDs don't accumulate in localStorage and confuse the access-control logic.
    setUserAssignments(prev => {
      const next = {};
      for (const [email, coIds] of Object.entries(prev)) {
        next[email] = coIds.filter(cid => cid !== id);
      }
      return next;
    });
  }, [companies]);

  const activeCompany = useMemo(
    () => companies.find(c => c.id === activeCompanyId) || companies[0] || null,
    [companies, activeCompanyId]
  );

  // ── Entry points ───────────────────────────────────────────
  const enterDemo = useCallback(() => {
    setUsingDemo(true); setIsAdmin(false);
    setUser({ id: 'demo', email: 'demo@postpilot.app', user_metadata: { display_name: 'Demo User' } });
  }, []);

  const enterAdmin = useCallback(() => {
    // ⚠ SECURITY: Remove this function for production
    // Admin access should be server-side only
    setUsingDemo(true); setIsAdmin(true);
    setUser({ id: 'admin', email: ADMIN_USERNAME, user_metadata: { display_name: 'Admin' } });
  }, []);

  const handleSignOut = useCallback(() => {
    if (usingDemo) { setUser(null); setUsingDemo(false); setIsAdmin(false); }
    else supabase.signOut();
  }, [usingDemo]);

  if (loading) return <Loader />;

  return (
    <ErrorBoundary>
      <AuthContext.Provider value={{ user, usingDemo, isAdmin, supabase }}>
        <CompanyContext.Provider value={{
          companies, activeCompanyId, activeCompany, setActiveCompanyId,
          userAssignments, setUserAssignments, addCompany, updateCompany, deleteCompany,
        }}>
          {user
            ? <MainApp onSignOut={handleSignOut} />
            : <AuthScreen onDemo={enterDemo} onAdmin={enterAdmin} />
          }
        </CompanyContext.Provider>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div className="loader-screen">
      <div className="loader-mark">P</div>
      <div className="loader-name">PostPilot</div>
      <div className="loader-dots"><span /><span /><span /></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────────────────────
function AuthScreen({ onDemo, onAdmin }) {
  const [mode,     setMode]     = useState('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [busy,     setBusy]     = useState(false);
  const lastSubmitRef            = useRef(0);

  const switchMode = m => { setMode(m); setError(''); setSuccess(''); };

  const go = async () => {
    // Debounce: ignore if last submit was < 1 second ago (prevents rapid double-tap)
    const now = Date.now();
    if (now - lastSubmitRef.current < 1000) return;
    lastSubmitRef.current = now;

    setError(''); setSuccess('');
    const trimEmail = email.trim();

    if (!trimEmail) return setError('Email is required');
    if (mode !== 'reset' && !password) return setError('Password is required');

    // Admin credential check — compare against build-time env vars
    if (mode === 'login' && ADMIN_USERNAME && trimEmail === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      onAdmin();
      return;
    }

    // Validate email format for Supabase flows
    if (mode !== 'login' || !ADMIN_USERNAME) {
      if (!isValidEmail(trimEmail)) return setError('Enter a valid email address');
    }

    if (mode === 'signup' && password.length < 8) return setError('Password must be at least 8 characters');
    if (!supabase.configured) return setError('Supabase not configured. Try Demo Mode or set env vars.');

    setBusy(true);
    try {
      if (mode === 'login') {
        await supabase.signIn(trimEmail, password);
      } else if (mode === 'signup') {
        const r = await supabase.signUp(trimEmail, password, name.trim() || trimEmail.split('@')[0]);
        if (r.confirmEmail) { setSuccess('Check your email to confirm, then sign in.'); switchMode('login'); }
      } else {
        await supabase.resetPassword(trimEmail);
        setSuccess('Password reset link sent! Check your inbox.');
        switchMode('login');
      }
    } catch (e) {
      setError(e.message || 'An error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-logo">P</div>
          <h1 className="auth-hero-title">PostPilot</h1>
          <p className="auth-hero-sub">Your social media command center. Schedule, publish, and analyze across every platform — from one beautiful dashboard.</p>
          <div className="auth-features">
            {['📅 Schedule up to 6 months ahead','📱 12 platforms supported','👥 Multi-user team access','☁️ Cloud-synced everywhere','📈 Built-in analytics','🤖 AI content assistant','🏢 Multi-company support','📦 Bulk CSV scheduling'].map(f => (
              <div key={f} className="auth-feat">{f}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-box">
          <h2 className="auth-title">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h2>
          <p className="auth-subtitle">
            {mode === 'login' ? 'Sign in to your dashboard' : mode === 'signup' ? 'Start managing social media today' : "We'll send you a reset link"}
          </p>

          {error   && <div className="alert alert-error" role="alert">{error}</div>}
          {success && <div className="alert alert-success" role="status">{success}</div>}

          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="auth-name">Display Name</label>
              <input id="auth-name" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="auth-email">Email {mode === 'login' ? '/ Username' : ''}</label>
            {/* type="email" enables browser validation; login also accepts username so type="text" there */}
            <input
              id="auth-email"
              type={mode === 'signup' || mode === 'reset' ? 'email' : 'text'}
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && go()}
              autoComplete={mode === 'signup' ? 'email' : 'username'}
            />
          </div>
          {mode !== 'reset' && (
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && go()}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 8 : undefined}
              />
            </div>
          )}

          <button className="btn-primary btn-full" onClick={go} disabled={busy} aria-busy={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>

          <div className="auth-links">
            {mode === 'login' && <>
              <button className="link-btn" onClick={() => switchMode('signup')}>No account? <strong>Sign up</strong></button>
              <button className="link-btn" onClick={() => switchMode('reset')}>Forgot password?</button>
            </>}
            {mode === 'signup' && <button className="link-btn" onClick={() => switchMode('login')}>Have an account? <strong>Sign in</strong></button>}
            {mode === 'reset'  && <button className="link-btn" onClick={() => switchMode('login')}>← Back to sign in</button>}
          </div>

          {DEMO_ENABLED && (
            <>
              <div className="auth-divider"><span>or</span></div>
              <button className="btn-demo" onClick={onDemo}>👋 Try Demo Mode — no account needed</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
function MainApp({ onSignOut }) {
  const { user, usingDemo, isAdmin } = useAuth();
  const { companies, activeCompanyId, userAssignments } = useCompany();

  const [tab,         setTab]         = useState('dashboard');
  const [posts,       setPosts]       = useState([]);
  // Single modal state ensures only one modal is ever open at a time,
  // which prevents stacked Escape-key handlers from closing multiple modals.
  const [activeModal, setActiveModal] = useState(null); // null | 'composer' | 'ai' | 'bulk'
  const [editingPost, setEditingPost] = useState(null);
  const [toast,       setToast]       = useState(null);
  const [connected,   setConnected]   = useState(() => {
    try {
      const s = localStorage.getItem('pp_connected');
      return s ? JSON.parse(s) : ['instagram','facebook','twitter','linkedin','tiktok'];
    } catch { return ['instagram','facebook','twitter','linkedin','tiktok']; }
  });
  const [syncing,     setSyncing]     = useState(false);
  const [showUser,    setShowUser]    = useState(false);

  useEffect(() => { localStorage.setItem('pp_connected', JSON.stringify(connected)); }, [connected]);

  // ── Toast with proper cleanup ──────────────────────────────
  const toastTimerRef = useRef(null);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const notify = useCallback((msg, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Stale-proof refs ───────────────────────────────────────────
  const postsRef = useRef(posts);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  // ── Company visibility ──────────────────────────────────────
  const userCompanies = useMemo(() => {
    if (isAdmin) return companies;
    const assigned = userAssignments[user?.email];
    if (assigned === undefined) return companies;       // user not listed → sees all
    if (assigned.length === 0)  return [];              // explicitly restricted → sees none
    return companies.filter(c => assigned.includes(c.id));
  }, [isAdmin, companies, userAssignments, user?.email]);

  // Posts scoped to the active company — strict equality only.
  // The old `!p.companyId` bypass let posts with no/empty companyId leak into
  // every company's view; dbToPost always provides a fallback so this is safe.
  const companyPosts = useMemo(
    () => posts.filter(p => p.companyId === activeCompanyId),
    [posts, activeCompanyId]
  );

  // ── Data loading ────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    setSyncing(true);
    try {
      const d = await supabase.query('posts', {
        filters: [['company_id', 'eq', activeCompanyId]],
        order:   'scheduled_date.asc',
      });
      setPosts(d.map(r => dbToPost(r, activeCompanyId)));
    } catch (e) {
      notify(`Cloud sync issue: ${e.message}`, 'error');
    } finally {
      setSyncing(false);
    }
  }, [activeCompanyId, notify]);

  useEffect(() => {
    if (usingDemo || !supabase.configured) {
      setPosts(makeDemoPosts());
      return;
    }
    loadPosts();
    // Polling picks up changes made by other users/sessions in this company
    const unsub = supabase.subscribeToTable('posts', incoming => {
      if (!incoming?.length) return;
      // Use activeCompanyId directly - subscription recreates when it changes
      const relevant = incoming.filter(r => r.company_id === activeCompanyId);
      if (!relevant.length) return;
      setPosts(prev => {
        const map = new Map(prev.map(p => [p.id, p]));
        relevant.forEach(r => map.set(r.id, dbToPost(r, activeCompanyId)));
        return Array.from(map.values())
          .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
      });
    });
    return unsub;
  }, [usingDemo, loadPosts, activeCompanyId]); // Explicitly depend on activeCompanyId for subscription

  // ── CRUD ────────────────────────────────────────────────────
  const savePost = useCallback(async post => {
    // Use postsRef to avoid stale closure — gets current posts without re-creating callback
    const exists = postsRef.current.some(p => p.id === post.id);
    setPosts(prev => {
      const list = exists
        ? prev.map(p => p.id === post.id ? post : p)
        : [...prev, post];
      return list.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
    });
    setActiveModal(null);
    setEditingPost(null);
    notify(post.status === 'draft' ? 'Draft saved!' : 'Post scheduled! 🚀');

    if (!usingDemo && supabase.configured) {
      try {
        const dbRow = postToDb(post, user.id, post.companyId || activeCompanyId);
        if (exists) await supabase.update('posts', post.id, dbRow);
        else        await supabase.insert('posts', [dbRow]);
      } catch (e) {
        notify(`Cloud sync failed: ${e.message}. Reloading…`, 'error');
        // Revert optimistic update
        loadPosts();
      }
    }
  }, [usingDemo, user, notify, activeCompanyId]);

  const deletePost = useCallback(async id => {
    setPosts(prev => prev.filter(p => p.id !== id));
    notify('Post deleted', 'info');
    if (!usingDemo && supabase.configured) {
      try {
        await supabase.delete('posts', id);
      } catch (e) {
        // Revert optimistic delete and inform the user
        notify(`Delete failed: ${e.message}. Refreshing…`, 'error');
        loadPosts();
      }
    }
  }, [usingDemo, notify, loadPosts]);

  const editPost = useCallback(p => { setEditingPost(p); setActiveModal('composer'); }, []);

  // Bulk import: single batch INSERT instead of N concurrent savePost calls.
  // Optimistic update happens immediately; cloud sync fires once for all rows.
  const handleBulkImport = useCallback(async items => {
    setPosts(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      items.forEach(p => map.set(p.id, p));
      return Array.from(map.values())
        .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
    });
    setActiveModal(null);

    if (!usingDemo && supabase.configured) {
      notify(`Syncing ${items.length} post${items.length !== 1 ? 's' : ''}…`);
      try {
        const rows = items.map(p => postToDb(p, user.id, p.companyId || activeCompanyId));
        await supabase.insert('posts', rows);
        notify(`${items.length} post${items.length !== 1 ? 's' : ''} imported!`);
      } catch (e) {
        notify(`Cloud sync failed: ${e.message}. Reverting…`, 'error');
        // Revert optimistic update by removing the imported posts
        setPosts(prev => prev.filter(p => !items.some(item => item.id === p.id)));
      }
    } else {
      notify(`${items.length} post${items.length !== 1 ? 's' : ''} imported!`);
    }
  }, [usingDemo, user, notify, activeCompanyId]);
  const toggleConnect = useCallback(pid => setConnected(prev =>
    prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]
  ), []);

  const dn       = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';
  const initials = dn.substring(0, 2).toUpperCase();

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'calendar',  label: 'Calendar',  icon: '📅' },
    { id: 'queue',     label: 'Queue',     icon: '📋' },
    { id: 'posts',     label: 'Posts',     icon: '📝' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'platforms', label: 'Platforms', icon: '🔌' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: '⚙️' }] : []),
  ];

  return (
    <div className="app">
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}

      <header className="header">
        <div className="header-left">
          <div className="logo-mark" aria-hidden="true">P</div>
          <div className="logo-wrap">
            <h1 className="logo-text">PostPilot</h1>
            <span className="sync-status">{usingDemo ? (isAdmin ? '⚙️ Admin' : 'Demo Mode') : syncing ? 'Syncing…' : '✅ Saved'}</span>
          </div>
          <CompanySwitcher userCompanies={userCompanies} />
        </div>

        <div className="header-right">
          <button className="btn-icon" onClick={() => setActiveModal('ai')}   title="AI Assistant"  aria-label="Open AI Assistant">🤖</button>
          <button className="btn-icon" onClick={() => setActiveModal('bulk')} title="Bulk Upload"   aria-label="Open Bulk Upload">📦</button>
          <button className="btn-new" onClick={() => { setEditingPost(null); setActiveModal('composer'); }}>
            <span className="btn-new-plus" aria-hidden="true">+</span> New Post
          </button>
          <div className="user-wrap">
            <button
              className={`avatar-btn ${isAdmin ? 'avatar-admin' : ''}`}
              onClick={() => setShowUser(v => !v)}
              aria-label="User menu"
              aria-expanded={showUser}
            >
              {initials}
            </button>
            {showUser && (
              <div className="user-dropdown" onMouseLeave={() => setShowUser(false)} role="menu">
                <div className="dropdown-head">
                  <div className="dropdown-name">{dn}</div>
                  <div className="dropdown-email">{user.email}</div>
                  {isAdmin && <div className="dropdown-admin-badge">⚙️ Administrator</div>}
                </div>
                <div className="dropdown-sep" />
                {usingDemo && !isAdmin && <div className="dropdown-item dropdown-demo">💡 Demo — data not saved to cloud</div>}
                <button className="dropdown-item dropdown-signout" onClick={onSignOut} role="menuitem">Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="nav" aria-label="Main navigation">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'nav-active' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {usingDemo && !isAdmin && (
        <div className="demo-banner" role="banner">
          👋 Demo Mode — <strong>sign up free</strong> to save posts to the cloud
          <button className="demo-cta" onClick={onSignOut}>Create Account →</button>
        </div>
      )}

      <main className="main">
        {tab === 'dashboard' && <Dashboard posts={companyPosts} onEdit={editPost} onNew={() => { setEditingPost(null); setActiveModal('composer'); }} onAI={() => setActiveModal('ai')} onBulk={() => setActiveModal('bulk')} connected={connected} />}
        {tab === 'calendar'  && <Calendar  posts={companyPosts} onEdit={editPost} onNew={d => { setEditingPost({ prefillDate: d }); setActiveModal('composer'); }} />}
        {tab === 'queue'     && <QueueView posts={companyPosts} onEdit={editPost} onNew={() => { setEditingPost(null); setActiveModal('composer'); }} />}
        {tab === 'posts'     && <PostsList posts={companyPosts} onEdit={editPost} onDelete={deletePost} />}
        {tab === 'analytics' && <Analytics posts={companyPosts} />}
        {tab === 'platforms' && <PlatformsView connected={connected} onToggle={toggleConnect} />}
        {tab === 'admin'     && isAdmin && <AdminPanel />}
      </main>

      {activeModal === 'composer' && (
        <Composer
          post={editingPost}
          connected={connected}
          onSave={savePost}
          onClose={() => { setActiveModal(null); setEditingPost(null); }}
          companyId={activeCompanyId}
        />
      )}
      {activeModal === 'ai' && (
        <AIAssistant
          onClose={() => setActiveModal(null)}
          onInsert={text => { setEditingPost({ prefillContent: text }); setActiveModal('composer'); }}
        />
      )}
      {activeModal === 'bulk' && (
        <BulkUpload
          onClose={() => setActiveModal(null)}
          onImport={handleBulkImport}
          connected={connected}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONFIRM DIALOG  (replaces window.confirm — non-blocking, styled)
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({ message, confirmLabel = 'Delete', danger = true, onConfirm, onCancel }) {
  // Close on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="comp-head">
          <h2 className="comp-title" id="confirm-title">Confirm Action</h2>
          <button className="close-btn" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 4 }}>{message}</p>
          <div className="modal-footer">
            <button className="cancel-btn" onClick={onCancel}>Cancel</button>
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '10px 22px', ...(danger && { background: '#DC2626' }) }}
              onClick={onConfirm}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPANY SWITCHER
// ─────────────────────────────────────────────────────────────
function CompanySwitcher({ userCompanies }) {
  const { activeCompany, setActiveCompanyId } = useCompany();
  const [open, setOpen] = useState(false);

  if (!activeCompany) return null;
  if (userCompanies.length <= 1) {
    return (
      <div className="co-current">
        <div className="co-badge" style={{ background: activeCompany.color }}>{activeCompany.initials}</div>
        <span className="co-name">{activeCompany.name}</span>
      </div>
    );
  }

  return (
    <div className="co-switcher">
      <button className="co-trigger" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="listbox">
        <div className="co-badge" style={{ background: activeCompany.color }}>{activeCompany.initials}</div>
        <span className="co-name">{activeCompany.name}</span>
        <span className="co-arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="co-dropdown" onMouseLeave={() => setOpen(false)} role="listbox" aria-label="Select company">
          <div className="co-dropdown-head">Switch Company</div>
          {userCompanies.map(co => (
            <button
              key={co.id}
              className={`co-option ${co.id === activeCompany.id ? 'co-option-active' : ''}`}
              onClick={() => { setActiveCompanyId(co.id); setOpen(false); }}
              role="option"
              aria-selected={co.id === activeCompany.id}
            >
              <div className="co-badge co-badge-sm" style={{ background: co.color }}>{co.initials}</div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="co-opt-name">{co.name}</div>
                <div className="co-opt-industry">{co.industry}</div>
              </div>
              {co.id === activeCompany.id && <span style={{ color: '#059669', fontWeight: 700 }} aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────────────────────
function AdminPanel() {
  const { companies, addCompany, updateCompany, deleteCompany, userAssignments, setUserAssignments } = useCompany();
  const [adminTab,     setAdminTab]     = useState('companies');
  const [showForm,     setShowForm]     = useState(false);
  const [editCo,       setEditCo]       = useState(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [emailError,   setEmailError]   = useState('');
  const [confirm,      setConfirm]      = useState(null); // { message, onConfirm }

  const handleSaveCompany = co => {
    if (editCo) updateCompany(co.id, co);
    else        addCompany(co);
    setShowForm(false); setEditCo(null);
  };

  const addUser = () => {
    const e = newUserEmail.trim().toLowerCase();
    setEmailError('');
    if (!e) return;
    if (!isValidEmail(e)) { setEmailError('Enter a valid email address'); return; }
    if (userAssignments[e]) { setEmailError('This user is already in the list'); return; }
    setUserAssignments(prev => ({ ...prev, [e]: [] }));
    setNewUserEmail('');
  };

  const toggleAssignment = (email, coId) => {
    setUserAssignments(prev => {
      const cur = prev[email] || [];
      return { ...prev, [email]: cur.includes(coId) ? cur.filter(id => id !== coId) : [...cur, coId] };
    });
  };

  const removeUser = email => {
    setUserAssignments(prev => { const n = { ...prev }; delete n[email]; return n; });
  };

  const usersCount     = Object.keys(userAssignments).length;
  const companiesCount = companies.length;

  return (
    <div>
      <div className="queue-header">
        <h2 className="section-title">⚙️ Admin Panel</h2>
        <p className="section-sub">Manage companies and control which users can access each one.</p>
      </div>

      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={adminTab === 'companies'} className={`admin-tab ${adminTab === 'companies' ? 'admin-tab-active' : ''}`} onClick={() => setAdminTab('companies')}>
          🏢 Companies <span className="q-cat-count">{companiesCount}</span>
        </button>
        <button role="tab" aria-selected={adminTab === 'users'} className={`admin-tab ${adminTab === 'users' ? 'admin-tab-active' : ''}`} onClick={() => setAdminTab('users')}>
          👥 User Assignments <span className="q-cat-count">{usersCount}</span>
        </button>
      </div>

      {/* ── Companies Tab ── */}
      {adminTab === 'companies' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-new" onClick={() => { setEditCo(null); setShowForm(true); }}>
              <span className="btn-new-plus">+</span> Add Company
            </button>
          </div>
          <div className="company-grid">
            {companies.map(co => {
              const assignedCount = Object.values(userAssignments).filter(ids => ids.includes(co.id)).length;
              return (
                <div key={co.id} className="company-card">
                  <div className="co-card-header">
                    <div className="co-badge-lg" style={{ background: co.color }}>{co.initials}</div>
                    <div>
                      <div className="co-card-name">{co.name}</div>
                      <div className="co-card-industry">{co.industry || 'No industry set'}</div>
                    </div>
                  </div>
                  <div className="co-card-stats">
                    <span>👥 {assignedCount} user{assignedCount !== 1 ? 's' : ''} assigned</span>
                  </div>
                  <div className="co-card-actions">
                    <button className="act-btn" onClick={() => { setEditCo(co); setShowForm(true); }}>✏️ Edit</button>
                    <button className="act-btn act-del" onClick={() => {
                      if (companies.length <= 1) {
                        setConfirm({ message: 'You must have at least one company.', confirmLabel: 'OK', danger: false, onConfirm: () => setConfirm(null) });
                        return;
                      }
                      setConfirm({
                        message: `Delete "${co.name}"? Posts assigned to this company will become unassigned.`,
                        confirmLabel: 'Delete Company',
                        onConfirm: () => { deleteCompany(co.id); setConfirm(null); },
                      });
                    }}>🗑️ Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Users Tab ── */}
      {adminTab === 'users' && (
        <div>
          <div className="user-add-row">
            <div style={{ flex: 1 }}>
              <input
                className="search-input"
                style={{ width: '100%' }}
                type="email"
                placeholder="Enter user email to manage…"
                value={newUserEmail}
                onChange={e => { setNewUserEmail(e.target.value); setEmailError(''); }}
                onKeyDown={e => e.key === 'Enter' && addUser()}
                aria-label="User email"
                aria-describedby={emailError ? 'email-error' : undefined}
              />
              {emailError && <div id="email-error" style={{ color: '#DC2626', fontSize: 11, marginTop: 3 }}>{emailError}</div>}
            </div>
            <button className="btn-sm" onClick={addUser}>Add User</button>
          </div>

          {usersCount === 0 ? (
            <div className="empty-box">
              <span className="empty-icon">👥</span>
              <p>No users added yet.</p>
              <p className="muted" style={{ marginTop: 4 }}>Enter an email above to control which companies a user can access.</p>
            </div>
          ) : (
            <div className="user-table">
              {Object.entries(userAssignments).map(([email, coIds]) => (
                <div key={email} className="user-row">
                  <div className="user-row-email">
                    <span className="user-email-icon" aria-hidden="true">✉️</span>
                    {email}
                  </div>
                  <div className="user-row-cos">
                    {companies.map(co => (
                      <label key={co.id} className={`user-co-label ${coIds.includes(co.id) ? 'user-co-label-on' : ''}`} style={coIds.includes(co.id) ? { borderColor: co.color, background: co.color + '10' } : {}}>
                        <input
                          type="checkbox"
                          checked={coIds.includes(co.id)}
                          onChange={() => toggleAssignment(email, co.id)}
                          aria-label={`Assign ${email} to ${co.name}`}
                        />
                        <div className="co-badge co-badge-xs" style={{ background: co.color }}>{co.initials}</div>
                        <span>{co.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className="act-btn act-del" style={{ flexShrink: 0 }} onClick={() => removeUser(email)} aria-label={`Remove ${email}`}>✕ Remove</button>
                </div>
              ))}
            </div>
          )}

          <p className="muted" style={{ marginTop: 12, fontSize: 11, lineHeight: 1.6 }}>
            💡 Users <strong>not in this list</strong> can see all companies. Users <strong>in this list</strong> are restricted to only their checked companies (empty = no access).
          </p>
        </div>
      )}

      {showForm && (
        <CompanyForm
          company={editCo}
          onSave={handleSaveCompany}
          onClose={() => { setShowForm(false); setEditCo(null); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger !== false}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPANY FORM MODAL
// ─────────────────────────────────────────────────────────────
function CompanyForm({ company, onSave, onClose }) {
  const [name,     setName]     = useState(company?.name     || '');
  const [industry, setIndustry] = useState(company?.industry || '');
  const [color,    setColor]    = useState(company?.color    || '#1D4ED8');
  const [initials, setInitials] = useState(company?.initials || '');
  const [nameError,setNameError]= useState('');

  const preview = (initials || name.substring(0, 2)).toUpperCase().slice(0, 2) || 'XX';

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Company name is required'); return; }
    if (trimmed.length > 80) { setNameError('Company name must be 80 characters or fewer'); return; }
    onSave({ id: company?.id || generateId(), name: trimmed, industry: industry.trim().slice(0, 80), color, initials: preview });
  };

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="company-form-title">
      <div className="modal-sm" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title" id="company-form-title">{company ? 'Edit Company' : 'New Company'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="co-name">Company Name *</label>
            <input
              id="co-name"
              value={name}
              onChange={e => { setName(e.target.value); setNameError(''); }}
              placeholder="e.g. Acme Marketing"
              autoFocus
              maxLength={80}
              aria-describedby={nameError ? 'co-name-error' : undefined}
              aria-invalid={!!nameError}
            />
            {nameError && <div id="co-name-error" style={{ color: '#DC2626', fontSize: 11, marginTop: 3 }}>{nameError}</div>}
          </div>
          <div className="field">
            <label htmlFor="co-industry">Industry</label>
            <input id="co-industry" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Retail, Tech, Agency" maxLength={80} />
          </div>
          <div className="comp-row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="co-initials">Initials (2 chars)</label>
              <input id="co-initials" value={initials} onChange={e => setInitials(e.target.value.toUpperCase().slice(0, 2))} placeholder="AM" maxLength={2} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="co-color">Brand Color</label>
              <input id="co-color" type="color" value={color} onChange={e => setColor(e.target.value)} style={{ height: 42, padding: '4px 6px', width: '100%', borderRadius: 8, border: '1.5px solid #E2E8F0' }} />
            </div>
          </div>

          {name.trim() && (
            <div className="co-preview-row">
              <div className="co-badge" style={{ background: color, width: 40, height: 40, fontSize: 15, borderRadius: 10 }}>{preview}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{name.trim()}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{industry || 'Industry'}</div>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 22px' }} onClick={save}>
              {company ? 'Save Changes' : 'Create Company'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
function Dashboard({ posts, onEdit, onNew, onAI, onBulk, connected }) {
  const { activeCompany } = useCompany();
  const pub    = posts.filter(p => p.status === 'published');
  const sched  = posts.filter(p => p.status === 'scheduled');
  const drafts = posts.filter(p => p.status === 'draft');
  const tEng   = pub.reduce((s, p) => s + (p.engagement?.likes || 0) + (p.engagement?.comments || 0) + (p.engagement?.shares || 0), 0);
  const tImp   = pub.reduce((s, p) => s + (p.engagement?.impressions || 0), 0);
  const rate   = tImp > 0 ? ((tEng / tImp) * 100).toFixed(1) : '0.0';

  return (
    <div>
      {activeCompany && (
        <div className="company-banner" style={{ borderColor: activeCompany.color + '40', background: activeCompany.color + '06' }}>
          <div className="co-badge" style={{ background: activeCompany.color }}>{activeCompany.initials}</div>
          <div>
            <div className="company-banner-name">{activeCompany.name}</div>
            <div className="company-banner-industry">{activeCompany.industry}</div>
          </div>
        </div>
      )}

      <div className="stats-row" role="list" aria-label="Post statistics">
        {[
          { icon: '✅', v: pub.length,           l: 'Published',  c: '#059669' },
          { icon: '⏰', v: sched.length,          l: 'Scheduled',  c: '#1D4ED8' },
          { icon: '📝', v: drafts.length,         l: 'Drafts',     c: '#B45309' },
          { icon: '❤️', v: tEng.toLocaleString(), l: 'Engagement', c: '#E1306C' },
          { icon: '👁️', v: tImp.toLocaleString(), l: 'Impressions',c: '#7C3AED' },
          { icon: '📊', v: rate + '%',            l: 'Eng. Rate',  c: '#0891B2' },
        ].map(s => (
          <div key={s.l} className="stat-card" role="listitem">
            <div className="stat-icon" style={{ background: s.c + '12', color: s.c }} aria-hidden="true">{s.icon}</div>
            <div className="stat-val">{s.v}</div>
            <div className="stat-lbl">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head"><h3 className="card-title">📅 Upcoming Posts</h3><button className="link-btn" onClick={onNew}>+ Create</button></div>
          {sched.length === 0 ? (
            <div className="empty-box"><span className="empty-icon">📭</span><p>No upcoming posts</p><button className="btn-sm" onClick={onNew}>Schedule a post</button></div>
          ) : sched.slice(0, 6).map(post => (
            <div key={post.id} className="upcoming-row" onClick={() => onEdit(post)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onEdit(post)}>
              <div className="up-date">
                <span className="up-dow">{new Date(post.scheduledDate).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="up-day">{new Date(post.scheduledDate).getDate()}</span>
              </div>
              <div className="up-body">
                <p className="up-text">{post.content.substring(0, 60)}{post.content.length > 60 ? '…' : ''}</p>
                <div className="up-meta">
                  {post.platforms.slice(0, 4).map(pid => { const p = PLATFORMS.find(x => x.id === pid); return <span key={pid} className="plat-dot" style={{ background: p?.color }} title={p?.name}>{p?.icon}</span>; })}
                  <span className="up-time">{fmtTime(post.scheduledDate)}</span>
                </div>
              </div>
              <div className="up-status-dot" style={{ background: post.status === 'scheduled' ? '#1D4ED8' : '#B45309' }} />
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="card-title">⏱️ Best Times to Post</h3>
          <p className="card-sub">Optimal posting windows by platform</p>
          {Object.entries(BEST_TIMES).map(([pid, times]) => {
            const p = PLATFORMS.find(x => x.id === pid);
            if (!p || !connected.includes(pid)) return null;
            return (
              <div key={pid} className="best-row">
                <span className="best-plat" style={{ background: p.color + '10', color: p.color }}>{p.icon} {p.name}</span>
                <div className="best-slots">{times.map((t, i) => <span key={i} className="best-slot">{t.day} {t.time}</span>)}</div>
              </div>
            );
          })}
        </div>

        <div className="card card-gradient">
          <h3 className="card-title">⚡ Quick Actions</h3>
          <div className="actions-stack">
            <button className="action-btn" onClick={onNew}>📝 Create New Post</button>
            <button className="action-btn" onClick={onNew}>📸 Upload Media &amp; Post</button>
            <button className="action-btn" onClick={onBulk}>📦 Bulk Schedule</button>
            <button className="action-btn" onClick={onAI}>🤖 AI Content Assistant</button>
          </div>

          <h3 className="card-title" style={{ marginTop: 18 }}>📊 Content Mix</h3>
          <div className="content-mix">
            {CONTENT_CATEGORIES.slice(0, 5).map(cat => {
              const count = posts.filter(p => p.category === cat.id).length;
              return (
                <div key={cat.id} className="mix-row">
                  <span className="mix-icon" aria-hidden="true">{cat.icon}</span>
                  <span className="mix-name">{cat.name}</span>
                  <div className="mix-bar" role="progressbar" aria-valuenow={count} aria-label={cat.name}>
                    <div className="mix-fill" style={{ width: `${Math.max(8, Math.min(100, count * 15))}%`, background: cat.color }} />
                  </div>
                  <span className="mix-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────────────────────
function Calendar({ posts, onEdit, onNew }) {
  const [cur,  setCur]  = useState(new Date());
  const [view, setView] = useState('month');
  const maxD  = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d; }, []);
  // useState (not useMemo) so it can be updated at midnight without remounting.
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const now       = new Date();
    const midnight  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer     = setTimeout(() => setToday(new Date()), midnight - now);
    return () => clearTimeout(timer);
  }, [today]); // re-schedule after each daily tick

  // ── Month view helpers ─────────────────────────────────────
  const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  const firstDow    = new Date(cur.getFullYear(), cur.getMonth(), 1).getDay();

  const postsOnDay = useCallback((dateObj) => posts.filter(p => {
    const d = new Date(p.scheduledDate);
    return d.getFullYear() === dateObj.getFullYear() &&
           d.getMonth()    === dateObj.getMonth()    &&
           d.getDate()     === dateObj.getDate();
  }), [posts]);

  const isSameDay = (dateObj) =>
    today.getFullYear() === dateObj.getFullYear() &&
    today.getMonth()    === dateObj.getMonth()    &&
    today.getDate()     === dateObj.getDate();

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => { const d = new Date(cur); d.setMonth(d.getMonth() - 1); setCur(d); };
  const nextMonth = () => { const d = new Date(cur); d.setMonth(d.getMonth() + 1); if (d <= maxD) setCur(d); };

  // ── Week view helpers ──────────────────────────────────────
  // Find the Sunday that starts the week containing `cur`
  const weekStart = useMemo(() => {
    const d = new Date(cur);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }, [cur]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);
  const prevWeek = () => { const d = new Date(cur); d.setDate(d.getDate() - 7); setCur(d); };
  const nextWeek = () => { const d = new Date(cur); d.setDate(d.getDate() + 7); if (d <= maxD) setCur(d); };

  const calTitle = view === 'week'
    ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const CalDayCell = ({ dateObj, maxPosts = 3 }) => {
    const dp   = postsOnDay(dateObj);
    const past = dateObj < todayMidnight;
    return (
      <div
        className={`cal-cell ${isSameDay(dateObj) ? 'cal-today' : ''} ${past ? 'cal-past' : ''}`}
        onClick={() => !past && onNew(dateObj.toISOString())}
        role="gridcell"
        aria-label={`${dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${dp.length ? `, ${dp.length} post${dp.length !== 1 ? 's' : ''}` : ''}`}
        tabIndex={past ? -1 : 0}
        onKeyDown={e => e.key === 'Enter' && !past && onNew(dateObj.toISOString())}
      >
        <span className={`cal-num ${isSameDay(dateObj) ? 'cal-num-today' : ''}`}>{dateObj.getDate()}</span>
        <div className="cal-posts">
          {dp.slice(0, maxPosts).map(post => (
            <div
              key={post.id}
              className="cal-dot"
              style={{ background: post.status === 'published' ? '#059669' : post.status === 'scheduled' ? '#1D4ED8' : '#B45309' }}
              onClick={e => { e.stopPropagation(); onEdit(post); }}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onEdit(post)}
              aria-label={`Edit post: ${post.content.substring(0, 40)}`}
            >
              {post.platforms.slice(0, 2).map(pid => PLATFORMS.find(x => x.id === pid)?.icon).join('')}
              <span className="cal-dot-time">{fmtTime(post.scheduledDate)}</span>
            </div>
          ))}
          {dp.length > maxPosts && <span className="cal-more">+{dp.length - maxPosts}</span>}
        </div>
      </div>
    );
  };

  const legend = (
    <div className="cal-legend" aria-label="Calendar legend">
      <span className="legend"><span className="ldot" style={{ background: '#059669' }} aria-hidden="true" /> Published</span>
      <span className="legend"><span className="ldot" style={{ background: '#1D4ED8' }} aria-hidden="true" /> Scheduled</span>
      <span className="legend"><span className="ldot" style={{ background: '#B45309' }} aria-hidden="true" /> Draft</span>
      <span className="legend-hint">Click any future day to schedule</span>
    </div>
  );

  return (
    <div>
      <div className="cal-controls">
        <div className="cal-nav">
          <button className="cal-arrow" onClick={view === 'week' ? prevWeek : prevMonth} aria-label={`Previous ${view}`}>‹</button>
          <h2 className="cal-month">{calTitle}</h2>
          <button className="cal-arrow" onClick={view === 'week' ? nextWeek : nextMonth} aria-label={`Next ${view}`}>›</button>
        </div>
        <div className="cal-right">
          <span className="cal-range-badge">📅 6-month window</span>
          <div className="view-toggle" role="group" aria-label="Calendar view">
            <button className={`vt-btn ${view === 'month' ? 'vt-active' : ''}`} onClick={() => setView('month')} aria-pressed={view === 'month'}>Month</button>
            <button className={`vt-btn ${view === 'week'  ? 'vt-active' : ''}`} onClick={() => setView('week')}  aria-pressed={view === 'week'}>Week</button>
          </div>
          <button className="today-btn" onClick={() => setCur(new Date())}>Today</button>
        </div>
      </div>

      {view === 'week' ? (
        <>
          <div className="cal-grid" role="grid" aria-label="Week calendar">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-hdr" role="columnheader">{d}</div>)}
            {weekDays.map((dateObj, i) => <CalDayCell key={i} dateObj={dateObj} maxPosts={8} />)}
          </div>
          {legend}
        </>
      ) : (
        <>
          <div className="cal-grid" role="grid" aria-label="Calendar">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-hdr" role="columnheader">{d}</div>)}
            {cells.map((day, idx) => {
              if (day === null) return <div key={`e-${idx}`} className="cal-empty" aria-hidden="true" />;
              return <CalDayCell key={day} dateObj={new Date(cur.getFullYear(), cur.getMonth(), day)} />;
            })}
          </div>
          {legend}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QUEUE VIEW
// ─────────────────────────────────────────────────────────────
function QueueView({ posts, onEdit, onNew }) {
  const [activeCat, setActiveCat] = useState('all');
  const scheduled = posts.filter(p => p.status === 'scheduled' || p.status === 'draft');
  const grouped   = CONTENT_CATEGORIES.map(cat => ({ ...cat, posts: scheduled.filter(p => p.category === cat.id) }));
  const display   = activeCat === 'all' ? scheduled : scheduled.filter(p => p.category === activeCat);

  return (
    <div>
      <div className="queue-header">
        <h2 className="section-title">Content Queue</h2>
        <p className="section-sub">Organize posts by category. Queue fills automatically based on your posting schedule.</p>
      </div>
      <div className="queue-cats" role="group" aria-label="Filter by category">
        <button className={`q-cat-btn ${activeCat === 'all' ? 'q-cat-active' : ''}`} onClick={() => setActiveCat('all')} aria-pressed={activeCat === 'all'}>
          All <span className="q-cat-count">{scheduled.length}</span>
        </button>
        {CONTENT_CATEGORIES.map(cat => (
          <button key={cat.id} className={`q-cat-btn ${activeCat === cat.id ? 'q-cat-active' : ''}`}
            style={activeCat === cat.id ? { background: cat.color + '12', borderColor: cat.color, color: cat.color } : {}}
            onClick={() => setActiveCat(cat.id)}
            aria-pressed={activeCat === cat.id}
          >
            {cat.icon} {cat.name} <span className="q-cat-count">{grouped.find(g => g.id === cat.id)?.posts.length || 0}</span>
          </button>
        ))}
      </div>
      <div className="queue-list">
        {display.length === 0 ? (
          <div className="empty-box"><span className="empty-icon">📭</span><p>No posts in this queue</p><button className="btn-sm" onClick={onNew}>Add content</button></div>
        ) : display.map((post, i) => (
          <div key={post.id} className="queue-item">
            <div className="qi-num" aria-label={`Position ${i + 1}`}>{i + 1}</div>
            <div className="qi-body">
              <p className="qi-text">{post.content.substring(0, 80)}{post.content.length > 80 ? '…' : ''}</p>
              <div className="qi-meta">
                {post.platforms.slice(0, 4).map(pid => { const p = PLATFORMS.find(x => x.id === pid); return <span key={pid} className="plat-dot" style={{ background: p?.color }} title={p?.name}>{p?.icon}</span>; })}
                <span className="qi-date">{fmt(post.scheduledDate)} • {fmtTime(post.scheduledDate)}</span>
              </div>
            </div>
            <div className="qi-actions">
              <button className="qi-btn" onClick={() => onEdit(post)} aria-label="Edit post">✏️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// POSTS LIST
// ─────────────────────────────────────────────────────────────
function PostsList({ posts, onEdit, onDelete }) {
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [platF,   setPlatF]   = useState('all');
  const [confirm, setConfirm] = useState(null);

  const filtered = useMemo(() => posts.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (platF !== 'all' && !p.platforms.includes(platF)) return false;
    if (search && !p.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [posts, filter, platF, search]);

  const confirmDelete = post => {
    setConfirm({
      message: `Delete this post? "${post.content.substring(0, 60)}${post.content.length > 60 ? '…' : ''}"`,
      onConfirm: () => { onDelete(post.id); setConfirm(null); },
    });
  };

  return (
    <div>
      <div className="filters">
        <input className="search-input" type="search" placeholder="🔍 Search posts…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search posts" />
        <div className="filter-pills" role="group" aria-label="Filter by status">
          {['all','published','scheduled','draft'].map(f => (
            <button key={f} className={`pill ${filter === f ? 'pill-active' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="pill-count">{f === 'all' ? posts.length : posts.filter(p => p.status === f).length}</span>
            </button>
          ))}
        </div>
        <select className="plat-select" value={platF} onChange={e => setPlatF(e.target.value)} aria-label="Filter by platform">
          <option value="all">All Platforms</option>
          {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
        </select>
      </div>
      <div className="post-list">
        {filtered.length === 0 ? (
          <div className="empty-box"><span className="empty-icon">📭</span><p>No posts match filters</p></div>
        ) : filtered.map(post => (
          <div key={post.id} className="post-card">
            <div className="pc-top">
              <span className={`badge badge-${post.status}`}>{post.status === 'published' ? '✅ Published' : post.status === 'scheduled' ? '⏰ Scheduled' : '📝 Draft'}</span>
              <span className="pc-type">{post.postType}</span>
            </div>
            <p className="pc-content">{post.content}</p>
            <div className="pc-meta">
              <div className="pc-plats">
                {post.platforms.map(pid => { const p = PLATFORMS.find(x => x.id === pid); return <span key={pid} className="plat-tag" style={{ background: p?.color + '0D', color: p?.color, borderColor: p?.color + '30' }}>{p?.icon} {p?.name}</span>; })}
              </div>
              <span className="pc-date">{fmt(post.scheduledDate)} • {fmtTime(post.scheduledDate)}</span>
            </div>
            {post.engagement && (
              <div className="eng-bar">
                <span>❤️ {post.engagement.likes}</span>
                <span>💬 {post.engagement.comments}</span>
                <span>🔁 {post.engagement.shares}</span>
                <span>👁️ {post.engagement.impressions?.toLocaleString()}</span>
              </div>
            )}
            <div className="pc-actions">
              <button className="act-btn" onClick={() => onEdit(post)}>✏️ Edit</button>
              <button className="act-btn" onClick={() => onEdit({ ...post, id: generateId(), status: 'draft', engagement: null, isDuplicate: true })}>📋 Duplicate</button>
              <button className="act-btn act-del" onClick={() => confirmDelete(post)}>🗑️ Delete</button>
            </div>
          </div>
        ))}
      </div>
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel="Delete Post"
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────
function Analytics({ posts }) {
  // Memoized so downstream useMemo hooks get a stable reference and only
  // recompute when posts actually change.
  const pub  = useMemo(() => posts.filter(p => p.status === 'published' && p.engagement), [posts]);
  const tl   = useMemo(() => pub.reduce((s, p) => s + (p.engagement?.likes       || 0), 0), [pub]);
  const tc   = useMemo(() => pub.reduce((s, p) => s + (p.engagement?.comments    || 0), 0), [pub]);
  const ts   = useMemo(() => pub.reduce((s, p) => s + (p.engagement?.shares      || 0), 0), [pub]);
  const ti   = useMemo(() => pub.reduce((s, p) => s + (p.engagement?.impressions || 0), 0), [pub]);
  const rate = ti > 0 ? ((tl + tc + ts) / ti * 100).toFixed(1) : '0';

  const platData = useMemo(() => {
    const d = {};
    pub.forEach(p => p.platforms.forEach(pid => {
      if (!d[pid]) d[pid] = { posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0 };
      d[pid].posts++;
      d[pid].likes       += p.engagement?.likes       || 0;
      d[pid].comments    += p.engagement?.comments    || 0;
      d[pid].shares      += p.engagement?.shares      || 0;
      d[pid].impressions += p.engagement?.impressions || 0;
    }));
    return d;
  }, [pub]);

  const topPost = useMemo(() => [...pub].sort((a, b) => {
    const ae = (a.engagement?.likes || 0) + (a.engagement?.comments || 0);
    const be = (b.engagement?.likes || 0) + (b.engagement?.comments || 0);
    return be - ae;
  })[0], [pub]);

  const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dayPosts = pub.filter(p => new Date(p.scheduledDate).toDateString() === d.toDateString());
    const eng = dayPosts.reduce((s, p) => s + (p.engagement?.likes || 0) + (p.engagement?.comments || 0), 0);
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: eng };
  }), [pub]);
  const maxWeek = Math.max(...weekData.map(d => d.value), 1);

  const totalEng = tl + tc + ts;

  return (
    <div>
      <div className="analytics-top">
        {[
          { v: tl.toLocaleString(), l: 'Total Likes'  },
          { v: tc.toLocaleString(), l: 'Comments'     },
          { v: ts.toLocaleString(), l: 'Shares'       },
          { v: ti.toLocaleString(), l: 'Impressions'  },
          { v: rate + '%',          l: 'Eng. Rate'    },
        ].map(s => (
          <div key={s.l} className="a-stat">
            <span className="a-num">{s.v}</span>
            <span className="a-label">{s.l}</span>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <div className="card">
          <h3 className="card-title">📈 Weekly Engagement</h3>
          <div className="week-chart" role="img" aria-label="Weekly engagement bar chart">
            {weekData.map((d, i) => (
              <div key={i} className="wc-col">
                <div className="wc-bar-wrap">
                  <div className="wc-bar" style={{ height: `${(d.value / maxWeek) * 100}%` }} role="presentation" />
                  <span className="wc-val">{d.value}</span>
                </div>
                <span className="wc-label">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">📱 Platform Performance</h3>
          {Object.keys(platData).length === 0 && <p className="muted">No published posts yet.</p>}
          {Object.entries(platData).map(([pid, d]) => {
            const p  = PLATFORMS.find(x => x.id === pid); if (!p) return null;
            const te = d.likes + d.comments + d.shares;
            const w  = totalEng > 0 ? Math.max(6, Math.min(100, (te / totalEng) * 100)) : 6;
            return (
              <div key={pid} className="pa-row">
                <div className="pa-head">
                  <span className="pa-icon" style={{ background: p.color + '10', color: p.color }} aria-hidden="true">{p.icon}</span>
                  <span className="pa-name">{p.name}</span>
                  <span className="pa-posts">{d.posts} post{d.posts !== 1 ? 's' : ''}</span>
                </div>
                <div className="pa-bar" role="progressbar" aria-valuenow={Math.round(w)} aria-label={`${p.name} share`}>
                  <div className="pa-fill" style={{ width: `${w}%`, background: p.color }} />
                </div>
                <div className="pa-stats">
                  <span>❤️ {d.likes.toLocaleString()}</span>
                  <span>💬 {d.comments.toLocaleString()}</span>
                  <span>🔁 {d.shares.toLocaleString()}</span>
                  <span>👁️ {d.impressions.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="top-row">
            <div className="top-post-wrap">
              <h3 className="card-title">🏆 Top Performing Post</h3>
              {topPost ? (
                <div className="top-post">
                  <p className="tp-content">{topPost.content}</p>
                  <div className="tp-stats">
                    {[
                      { v: topPost.engagement.likes,                        l: 'Likes' },
                      { v: topPost.engagement.comments,                     l: 'Comments' },
                      { v: topPost.engagement.shares,                       l: 'Shares' },
                      { v: topPost.engagement.impressions?.toLocaleString(), l: 'Impressions' },
                    ].map(s => (
                      <div key={s.l} className="tp-stat">
                        <span className="tp-num">{s.v}</span>
                        <span className="tp-lbl">{s.l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="muted">Publish posts to see analytics</p>}
            </div>
            <div className="tips-wrap">
              <h3 className="card-title">💡 Content Tips</h3>
              <div className="tips">
                {['Posts with questions get 2× more comments','Visual content boosts engagement by 150%','Use 5–10 hashtags on Instagram','Post during audience peak hours','Short-form video gets 3× more shares','Consistency beats frequency'].map(t => (
                  <div key={t} className="tip">{t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PLATFORMS
// ─────────────────────────────────────────────────────────────
function PlatformsView({ connected, onToggle }) {
  return (
    <div>
      <h2 className="section-title">Connected Platforms</h2>
      <p className="section-sub">Connect social accounts to schedule and publish posts.</p>
      <div className="platforms-grid">
        {PLATFORMS.map(p => {
          const on = connected.includes(p.id);
          return (
            <div key={p.id} className={`plat-card ${on ? 'plat-on' : ''}`} style={{ borderColor: on ? p.color + '40' : undefined }}>
              <div className="plat-card-icon" style={{ background: p.color + '0D' }}><span style={{ fontSize: 24 }} aria-hidden="true">{p.icon}</span></div>
              <h4 className="plat-card-name">{p.name}</h4>
              <p className="plat-card-chars">{p.maxChars.toLocaleString()} char limit</p>
              <div className="plat-card-status" style={{ color: on ? '#059669' : '#94A3B8' }}>{on ? '✅ Connected' : 'Not connected'}</div>
              <button
                className="plat-connect-btn"
                style={{ background: on ? '#FEE2E2' : p.color, color: on ? '#DC2626' : '#FFF' }}
                onClick={() => onToggle(p.id)}
                aria-pressed={on}
              >
                {on ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPOSER
// ─────────────────────────────────────────────────────────────
function Composer({ post, connected, onSave, onClose, companyId }) {
  // isDuplicate flag distinguishes a duplicated post (needs INSERT) from a
  // genuine edit (needs UPDATE). Without it, isEdit = true for duplicates
  // because they have an id but no prefillDate/prefillContent.
  const isEdit            = !!(post?.id && !post.prefillDate && !post.prefillContent && !post.isDuplicate);
  const effectiveCompanyId = isEdit ? (post.companyId || companyId) : companyId;

  // Strip the hashtag suffix that was appended on the previous save so the
  // body textarea and hashtag field don't both contain the same tags, which
  // would double them on every subsequent save.
  const [content,    setContent]    = useState(
    isEdit ? stripHashtagSuffix(post.content, post.hashtags) : (post?.prefillContent || '')
  );
  const [plats,      setPlats]      = useState(isEdit ? post.platforms : []);
  const [postType,   setPostType]   = useState(isEdit ? post.postType  : 'Post');
  const [schedDate,  setSchedDate]  = useState(() => {
    if (isEdit)             return new Date(post.scheduledDate).toISOString().slice(0, 16);
    if (post?.prefillDate)  return new Date(post.prefillDate).toISOString().slice(0, 16);
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d.toISOString().slice(0, 16);
  });
  const [hashtags,   setHashtags]   = useState(isEdit ? (post.hashtags || []).join(' ') : '');
  const [activeHash, setActiveHash] = useState('');
  const [category,   setCategory]   = useState(isEdit ? (post.category || '') : '');
  const [perNetwork, setPerNetwork] = useState(isEdit ? (post.perNetwork || {}) : {});
  const [showPerNet, setShowPerNet] = useState(isEdit && Object.keys(post.perNetwork || {}).length > 0);
  const [contentErr, setContentErr] = useState('');

  const maxDate   = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toISOString().slice(0, 16); }, []);
  const minDate   = useMemo(() => new Date().toISOString().slice(0, 16), []);
  const charLimit = plats.length === 0 ? 5000 : Math.min(...plats.map(pid => PLATFORMS.find(x => x.id === pid)?.maxChars || 5000));
  // Count content without trailing whitespace for accuracy
  const baseContent  = content.trimEnd();
  const hashtagPart  = hashtags.trim() ? `\n\n${hashtags.trim()}` : '';
  const charCount    = baseContent.length + hashtagPart.length;
  const overLimit    = charCount > charLimit;

  const togglePlat = pid => setPlats(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]);

  const addHashSet = name => {
    const tags = HASHTAG_SETS[name] || [];
    const cur  = hashtags.split(' ').filter(Boolean);
    setHashtags([...new Set([...cur, ...tags])].join(' '));
    setActiveHash(name);
  };

  const save = (draft = false) => {
    const trimmed = content.trim();
    if (!trimmed) { setContentErr('Post content cannot be empty'); return; }
    if (!draft && plats.length === 0) { setContentErr('Select at least one platform'); return; }
    if (!draft && overLimit) { setContentErr(`Content exceeds the ${charLimit.toLocaleString()} character limit`); return; }
    // Validate date — the browser's min attribute can be bypassed by typing directly.
    const scheduledTime = new Date(schedDate);
    if (isNaN(scheduledTime.getTime())) { setContentErr('Invalid scheduled date/time'); return; }
    if (!draft && scheduledTime <= new Date()) { setContentErr('Scheduled time must be in the future'); return; }
    setContentErr('');
    const full = hashtags.trim() ? `${trimmed}\n\n${hashtags.trim()}` : trimmed;
    onSave({
      id:            isEdit ? post.id : generateId(),
      content:       full,
      platforms:     plats,
      scheduledDate: new Date(schedDate).toISOString(),
      status:        draft ? 'draft' : 'scheduled',
      postType,
      hashtags:      hashtags.trim().split(/\s+/).filter(Boolean),
      engagement:    isEdit ? post.engagement : null,
      category,
      perNetwork,
      mediaUrls:     [],
      companyId:     effectiveCompanyId,
    });
  };

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <div className="composer" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title" id="composer-title">{isEdit ? 'Edit Post' : 'Create New Post'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close composer">✕</button>
        </div>

        <div className="comp-body">
          <div className="comp-main">
            {/* Platforms */}
            <div className="comp-section">
              <label className="comp-label">
                Platforms
                <span className="comp-actions">
                  <button className="tiny-btn" onClick={() => setPlats([...connected])}>All</button>
                  <button className="tiny-btn" onClick={() => setPlats([])}>Clear</button>
                </span>
              </label>
              <div className="plat-picker" role="group" aria-label="Select platforms">
                {PLATFORMS.filter(p => connected.includes(p.id)).map(p => (
                  <button
                    key={p.id}
                    className={`pick-btn ${plats.includes(p.id) ? 'pick-on' : ''}`}
                    style={plats.includes(p.id) ? { background: p.color + '10', borderColor: p.color, color: p.color } : {}}
                    onClick={() => togglePlat(p.id)}
                    aria-pressed={plats.includes(p.id)}
                  >
                    {p.icon} {p.name} {plats.includes(p.id) && <span aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Post Type + Category */}
            <div className="comp-row">
              <div className="comp-section" style={{ flex: 1 }}>
                <label className="comp-label">Post Type</label>
                <div className="type-picker" role="group" aria-label="Post type">
                  {POST_TYPES.map(t => (
                    <button key={t} className={`type-btn ${postType === t ? 'type-active' : ''}`} onClick={() => setPostType(t)} aria-pressed={postType === t}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="comp-section" style={{ flex: 1 }}>
                <label htmlFor="comp-category" className="comp-label">Category</label>
                <select id="comp-category" className="cat-select" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">None</option>
                  {CONTENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Content */}
            <div className="comp-section">
              <label htmlFor="comp-content" className="comp-label">
                Content
                <span className="char-count" style={{ color: overLimit ? '#DC2626' : '#94A3B8' }}>
                  {charCount.toLocaleString()}/{charLimit.toLocaleString()}
                </span>
              </label>
              <textarea
                id="comp-content"
                className="comp-textarea"
                placeholder="What's on your mind? Write your post content here…"
                value={content}
                onChange={e => { setContent(e.target.value); setContentErr(''); }}
                rows={5}
                aria-describedby={contentErr ? 'content-error' : undefined}
                aria-invalid={!!contentErr}
              />
              {contentErr && <div id="content-error" style={{ color: '#DC2626', fontSize: 11, marginTop: 3 }}>{contentErr}</div>}
              {plats.length > 1 && (
                <button className="per-net-toggle" onClick={() => setShowPerNet(v => !v)}>
                  {showPerNet ? '▾ Hide' : '▸ Customize'} per-network text
                </button>
              )}
              {showPerNet && plats.map(pid => {
                const p = PLATFORMS.find(x => x.id === pid);
                const netCount = (perNetwork[pid] || '').length;
                return (
                  <div key={pid} className="per-net-box">
                    <label className="per-net-label" style={{ color: p?.color }}>
                      {p?.icon} {p?.name}
                      <span className="per-net-limit"> ({netCount}/{p?.maxChars} chars)</span>
                    </label>
                    <textarea
                      className="per-net-textarea"
                      placeholder={`Custom text for ${p?.name} (leave blank to use main content)`}
                      value={perNetwork[pid] || ''}
                      onChange={e => setPerNetwork(prev => ({ ...prev, [pid]: e.target.value }))}
                      rows={3}
                      maxLength={p?.maxChars}
                    />
                  </div>
                );
              })}
            </div>

            {/* Media */}
            <div className="comp-section">
              <label className="comp-label">Media</label>
              <div className="media-drop" role="button" tabIndex={0} aria-label="Upload media files">
                <span style={{ fontSize: 20 }} aria-hidden="true">🖼</span>
                <p>Drag &amp; drop images or videos</p>
                <button className="upload-btn" type="button">Browse Files</button>
                <p className="media-note">JPG, PNG, GIF, MP4, MOV • Max 100 MB</p>
              </div>
            </div>

            {/* Hashtags */}
            <div className="comp-section">
              <label htmlFor="hash-input" className="comp-label">Hashtags</label>
              <div className="hash-sets" role="group" aria-label="Hashtag presets">
                {Object.keys(HASHTAG_SETS).map(s => (
                  <button key={s} className={`hash-btn ${activeHash === s ? 'hash-active' : ''}`} onClick={() => addHashSet(s)} aria-pressed={activeHash === s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <input id="hash-input" className="hash-input" type="text" placeholder="#hashtag1 #hashtag2" value={hashtags} onChange={e => setHashtags(e.target.value)} />
            </div>

            {/* Schedule */}
            <div className="comp-section">
              <label htmlFor="sched-date" className="comp-label">Schedule</label>
              <div className="sched-row">
                <input
                  id="sched-date"
                  type="datetime-local"
                  className="date-input"
                  value={schedDate}
                  onChange={e => setSchedDate(e.target.value)}
                  min={minDate}
                  max={maxDate}
                />
                <span className="sched-note">Up to 6 months ahead</span>
              </div>
              {plats.length > 0 && (
                <div className="best-suggest">
                  💡 Suggested: {plats.slice(0, 2).map(pid => {
                    const t = BEST_TIMES[pid]; const p = PLATFORMS.find(x => x.id === pid);
                    return t ? <span key={pid} className="suggest-tag">{p?.icon} {t[0].day} {t[0].time}</span> : null;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Live Preview */}
          <div className="comp-preview" aria-label="Post preview">
            <h4 className="prev-title">📱 Live Preview</h4>
            {plats.length === 0 ? <div className="prev-empty">Select platforms to preview</div> : (
              <div className="prev-phone">
                <div className="prev-head">
                  <div className="prev-avatar" aria-hidden="true">R</div>
                  <div>
                    <div className="prev-user">@youraccount</div>
                    <div className="prev-ts">Scheduled • {fmt(schedDate)}</div>
                  </div>
                </div>
                <div className="prev-content">{content.trim() || <span className="muted italic">Your content here…</span>}</div>
                {hashtags.trim() && <div className="prev-hash">{hashtags.trim()}</div>}
                <div className="prev-media" aria-hidden="true">
                  {postType === 'Video' || postType === 'Reel' ? '🎬' : postType === 'Story' ? '📸' : '🖼️'} {postType} preview
                </div>
                <div className="prev-actions" aria-hidden="true"><span>❤️ Like</span><span>💬 Comment</span><span>🔁 Share</span></div>
              </div>
            )}
            <div className="prev-plats">
              {plats.map(pid => { const p = PLATFORMS.find(x => x.id === pid); return <span key={pid} className="prev-plat" style={{ background: p?.color + '0D', color: p?.color }}>{p?.icon} {p?.name}</span>; })}
            </div>
          </div>
        </div>

        <div className="comp-footer">
          <button className="draft-btn" onClick={() => save(true)}>💾 Save Draft</button>
          <div className="comp-footer-right">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button
              className="sched-btn"
              onClick={() => save(false)}
              disabled={!content.trim() || plats.length === 0 || overLimit}
              aria-disabled={!content.trim() || plats.length === 0 || overLimit}
            >
              🚀 Schedule Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AI ASSISTANT
// ─────────────────────────────────────────────────────────────
function AIAssistant({ onClose, onInsert }) {
  const [prompt,   setPrompt]   = useState('');
  const [result,   setResult]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [tone,     setTone]     = useState('professional');
  const [platform, setPlatform] = useState('instagram');
  const [aiError,  setAiError]  = useState('');
  const abortRef = useRef(null);

  // Cancel in-flight AI request on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const presets = [
    { label: '📢 Product Launch', prompt: 'Write an exciting social media post announcing a new product launch' },
    { label: '📅 Event Promo',    prompt: 'Create a post promoting an upcoming event with a call to action' },
    { label: '💡 Tips & Tricks',  prompt: 'Write an educational post sharing 3 useful tips related to our industry' },
    { label: '🙏 Thank You',      prompt: 'Write a heartfelt thank you post to our followers and community' },
    { label: '📊 Stat/Fact',      prompt: 'Create a post highlighting an interesting industry statistic' },
    { label: '🤔 Question',       prompt: 'Write an engaging question post to boost audience interaction' },
  ];

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setResult(''); setAiError('');
    abortRef.current = new AbortController();
    try {
      const p = PLATFORMS.find(x => x.id === platform);
      // Route through the /api/generate serverless proxy so the Anthropic API
      // key stays server-side and CORS is never an issue.
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          prompt:   prompt.trim(),
          tone,
          platform: p?.name    || 'Social Media',
          maxChars: p?.maxChars || 2200,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      if (!data.text) throw new Error('Empty response from AI');
      setResult(data.text);
    } catch (e) {
      if (e.name === 'AbortError') return; // user navigated away
      setAiError(
        e.message.includes('not configured')
          ? 'AI service not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables.'
          : `Generation failed: ${e.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ai-title">
      <div className="ai-modal" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title" id="ai-title">🤖 AI Content Assistant</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ai-body">
          <div className="ai-presets">
            <label className="comp-label">Quick Presets</label>
            <div className="ai-preset-grid">
              {presets.map(p => <button key={p.label} className="ai-preset-btn" onClick={() => setPrompt(p.prompt)}>{p.label}</button>)}
            </div>
          </div>

          <div className="ai-config">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ai-tone">Tone</label>
              <select id="ai-tone" value={tone} onChange={e => setTone(e.target.value)}>
                {['professional','casual','witty','inspirational','urgent','friendly'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ai-platform">Platform</label>
              <select id="ai-platform" value={platform} onChange={e => setPlatform(e.target.value)}>
                {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="ai-prompt">What should the post be about?</label>
            <textarea
              id="ai-prompt"
              className="comp-textarea"
              rows={3}
              placeholder="Describe what you want to post about…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              maxLength={500}
            />
          </div>

          {aiError && <div className="alert alert-error" role="alert">{aiError}</div>}

          <button className="btn-primary" onClick={generate} disabled={loading || !prompt.trim()} aria-busy={loading}>
            {loading ? '✨ Generating…' : '✨ Generate Post'}
          </button>

          {result && (
            <div className="ai-result">
              <label className="comp-label">Generated Content</label>
              <div className="ai-result-text">{result}</div>
              <button className="btn-primary" onClick={() => onInsert(result)}>📋 Use This Content</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BULK UPLOAD (CSV)
// ─────────────────────────────────────────────────────────────
function BulkUpload({ onClose, onImport, connected }) {
  const { activeCompanyId } = useCompany();
  const [csvText, setCsvText] = useState('');
  const [parsed,  setParsed]  = useState([]);
  const [error,   setError]   = useState('');

  const sampleCSV = `content,platforms,date,time,type
"🚀 Exciting news coming soon!",instagram|facebook,2026-04-15,10:00,Post
"Behind the scenes today 🎬",tiktok|instagram,2026-04-16,14:00,Reel
"Tips for better engagement 📊",linkedin|twitter,2026-04-17,09:00,Post`;

  const parseCSV = () => {
    setError(''); setParsed([]);
    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) return setError('Need at least a header row and one data row');

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
      if (!headers.includes('content')) return setError('CSV must include a "content" column');

      const posts   = [];
      const skipped = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // skip blank lines

        const vals = parseCSVLine(line);
        const row  = {};
        headers.forEach((h, j) => { row[h] = vals[j] !== undefined ? vals[j] : ''; });

        if (!row.content?.trim()) { skipped.push(i + 1); continue; }

        const platIds = (row.platforms || '')
          .split('|')
          .map(s => s.trim())
          .filter(pid => PLATFORMS.find(x => x.id === pid));

        // Validate date format
        const dateStr = row.date || new Date().toISOString().slice(0, 10);
        const timeStr = row.time || '10:00';
        const scheduled = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(scheduled.getTime())) { skipped.push(i + 1); continue; }

        // Reject dates in the past
        if (scheduled < new Date()) { skipped.push(i + 1); continue; }

        posts.push({
          id:            generateId(),
          content:       row.content.trim(),
          platforms:     platIds.length > 0 ? platIds : [connected[0] || 'instagram'],
          scheduledDate: scheduled.toISOString(),
          status:        'scheduled',
          postType:      row.type || 'Post',
          hashtags:      [],
          engagement:    null,
          category:      '',
          mediaUrls:     [],
          companyId:     activeCompanyId,
        });
      }

      if (posts.length === 0) return setError('No valid future-dated posts found. Check dates and required columns.');
      setParsed(posts);
      if (skipped.length) setError(`${posts.length} posts ready. Skipped rows: ${skipped.join(', ')} (empty, invalid date, or past-dated).`);
    } catch (e) {
      setError(`Could not parse CSV: ${e.message}`);
    }
  };

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="bulk-title">
      <div className="ai-modal" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title" id="bulk-title">📦 Bulk Upload (CSV)</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ai-body">
          <p className="section-sub">Paste CSV data below. Rows with past dates or missing content are skipped.</p>
          <div className="bulk-sample">
            <label className="comp-label">Sample Format</label>
            <pre className="sample-pre">{sampleCSV}</pre>
            <button className="tiny-btn" onClick={() => { setCsvText(sampleCSV); setError(''); setParsed([]); }}>Use Sample</button>
          </div>
          <div className="field">
            <label htmlFor="csv-input">CSV Data</label>
            <textarea
              id="csv-input"
              className="comp-textarea"
              rows={8}
              placeholder="Paste your CSV here…"
              value={csvText}
              onChange={e => { setCsvText(e.target.value); setError(''); setParsed([]); }}
            />
          </div>
          {error && <div className={`alert ${parsed.length > 0 ? 'alert-success' : 'alert-error'}`} role={parsed.length > 0 ? 'status' : 'alert'}>{error}</div>}
          <button className="btn-primary" onClick={parseCSV} disabled={!csvText.trim()}>Parse CSV</button>
          {parsed.length > 0 && (
            <div className="bulk-preview">
              <label className="comp-label">Preview: {parsed.length} posts ready to import</label>
              <div className="bulk-list">
                {parsed.slice(0, 5).map((p, i) => (
                  <div key={i} className="bulk-item">
                    <span className="bulk-num">{i + 1}</span>
                    <span className="bulk-text">{p.content.substring(0, 50)}{p.content.length > 50 ? '…' : ''}</span>
                    <span className="bulk-date">{fmt(p.scheduledDate)}</span>
                  </div>
                ))}
                {parsed.length > 5 && <div className="muted">…and {parsed.length - 5} more</div>}
              </div>
              <button className="btn-primary" onClick={() => onImport(parsed)}>📥 Import {parsed.length} Posts</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DEMO DATA  (stable — IDs only generated once per demo session)
// ─────────────────────────────────────────────────────────────
function makeDemoPosts() {
  const now  = new Date();
  const captions = [
    '🚀 Big things are coming! Stay tuned for our exciting announcement.',
    'Behind the scenes look at our creative process. Thoughts? 🎨',
    'Happy Monday! Start your week with positive energy ✨',
    'New product alert! 🎉 Check out what we have been working on.',
    'Thank you to our amazing community! You make it all possible 🙏',
    'Tips & tricks for better social engagement 📊',
    'Weekend vibes! How are you spending yours? 🌟',
    'Throwback to an incredible event last month! #TBT',
    'We just hit a major milestone. Here is the full story 🎯',
    'What content do you want more of? Drop your ideas below 💬',
    'Our team is growing! Meet our newest member 🤝',
    'Quick poll: Morning posts or evening posts? Vote below! 📊',
    'Customer spotlight: See how our clients use our product 💪',
    '5 tips to boost your productivity this week 🚀',
    'Flash sale alert! 24 hours only — don\'t miss out 🔥',
  ];
  const cats  = ['promotional','educational','entertaining','inspirational','behindscenes','ugc','curated'];
  const coIds = DEMO_COMPANIES.map(c => c.id);

  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + Math.floor(Math.random() * 90) - 15);
    d.setHours(Math.floor(Math.random() * 12) + 7, Math.floor(Math.random() * 4) * 15, 0, 0);
    const pids = PLATFORMS.slice(0, Math.floor(Math.random() * 4) + 1).map(p => p.id);
    const st   = d < now ? 'published' : ['scheduled','draft'][Math.floor(Math.random() * 2)];
    return {
      id:            generateId(),
      content:       captions[i % captions.length],
      platforms:     pids,
      scheduledDate: d.toISOString(),
      status:        st,
      postType:      POST_TYPES[Math.floor(Math.random() * 3)],
      hashtags:      ['#social','#marketing','#content'],
      engagement:    st === 'published' ? {
        likes:       Math.floor(Math.random() * 800),
        comments:    Math.floor(Math.random() * 120),
        shares:      Math.floor(Math.random() * 60),
        impressions: Math.floor(Math.random() * 8000) + 500,
      } : null,
      category:  cats[Math.floor(Math.random() * cats.length)],
      mediaUrls: [],
      companyId: coIds[i % coIds.length],
    };
  }).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
}
