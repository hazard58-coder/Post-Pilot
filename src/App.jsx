import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
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
// NOTE: Hardcoded for prototype/demo use only.
// In production use backend authentication (e.g. Supabase roles).
// ─────────────────────────────────────────────────────────────
const ADMIN_USERNAME = 'hazard58';
const ADMIN_PASSWORD = 'Truist58!';

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
export default function PostPilotApp() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
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
    () => localStorage.getItem('pp_active_co') || DEMO_COMPANIES[0].id
  );

  const [userAssignments, setUserAssignments] = useState(() => {
    try {
      const s = localStorage.getItem('pp_user_assignments');
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('pp_companies',         JSON.stringify(companies));       }, [companies]);
  useEffect(() => { localStorage.setItem('pp_active_co',         activeCompanyId);                 }, [activeCompanyId]);
  useEffect(() => { localStorage.setItem('pp_user_assignments',  JSON.stringify(userAssignments)); }, [userAssignments]);

  // ── Auth ───────────────────────────────────────────────────
  useEffect(() => {
    if (supabase.configured) {
      supabase.restoreSession().then(s => { if (s?.user) setUser(s.user); setLoading(false); });
    } else { setLoading(false); }
    const unsub = supabase.subscribe((ev, s) => {
      if (ev === 'SIGNED_IN')  setUser(s.user);
      if (ev === 'SIGNED_OUT') { setUser(null); setUsingDemo(false); setIsAdmin(false); }
    });
    return unsub;
  }, []);

  // ── Company operations ─────────────────────────────────────
  const addCompany = useCallback(co => setCompanies(prev => [...prev, co]), []);
  const updateCompany = useCallback((id, data) =>
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...data } : c)), []);
  const deleteCompany = useCallback(id => {
    setCompanies(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (activeCompanyId === id && remaining.length > 0) setActiveCompanyId(remaining[0].id);
      return remaining;
    });
  }, [activeCompanyId]);

  const activeCompany = useMemo(
    () => companies.find(c => c.id === activeCompanyId) || companies[0] || null,
    [companies, activeCompanyId]
  );

  // ── Entry points ───────────────────────────────────────────
  const enterDemo = () => {
    setUsingDemo(true); setIsAdmin(false);
    setUser({ id: 'demo', email: 'demo@postpilot.app', user_metadata: { display_name: 'Demo User' } });
  };

  const enterAdmin = () => {
    setUsingDemo(true); setIsAdmin(true);
    setUser({ id: 'admin', email: ADMIN_USERNAME, user_metadata: { display_name: 'Admin' } });
  };

  const handleSignOut = () => {
    if (usingDemo) { setUser(null); setUsingDemo(false); setIsAdmin(false); }
    else supabase.signOut();
  };

  if (loading) return <Loader />;

  return (
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

  const go = async () => {
    setError(''); setSuccess('');
    if (!email) return setError('Email is required');
    if (mode !== 'reset' && !password) return setError('Password is required');

    // Admin credential check (prototype — see ADMIN_USERNAME/ADMIN_PASSWORD)
    if (mode === 'login' && email === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      onAdmin();
      return;
    }

    if (mode === 'signup' && password.length < 6) return setError('Password must be 6+ characters');
    if (!supabase.configured) return setError('Supabase not configured. Use Demo Mode or add env vars.');
    setBusy(true);
    try {
      if (mode === 'login') {
        await supabase.signIn(email, password);
      } else if (mode === 'signup') {
        const r = await supabase.signUp(email, password, name || email.split('@')[0]);
        if (r.confirmEmail) { setSuccess('Check your email to confirm, then sign in.'); setMode('login'); }
      } else {
        await supabase.resetPassword(email); setSuccess('Reset link sent!'); setMode('login');
      }
    } catch (e) { setError(e.message); }
    setBusy(false);
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

          {error   && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {mode === 'signup' && (
            <div className="field"><label>Display Name</label>
              <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div className="field"><label>Email / Username</label>
            <input type="text" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          </div>
          {mode !== 'reset' && (
            <div className="field"><label>Password</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
            </div>
          )}

          <button className="btn-primary btn-full" onClick={go} disabled={busy}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>

          <div className="auth-links">
            {mode === 'login' && <>
              <button className="link-btn" onClick={() => { setMode('signup'); setError(''); }}>No account? <strong>Sign up</strong></button>
              <button className="link-btn" onClick={() => { setMode('reset');  setError(''); }}>Forgot password?</button>
            </>}
            {mode === 'signup' && <button className="link-btn" onClick={() => { setMode('login'); setError(''); }}>Have an account? <strong>Sign in</strong></button>}
            {mode === 'reset'  && <button className="link-btn" onClick={() => { setMode('login'); setError(''); }}>← Back to sign in</button>}
          </div>

          <div className="auth-divider"><span>or</span></div>
          <button className="btn-demo" onClick={onDemo}>👋 Try Demo Mode — no account needed</button>
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
  const { companies, activeCompanyId, setActiveCompanyId, userAssignments } = useCompany();

  const [tab,           setTab]           = useState('dashboard');
  const [posts,         setPosts]         = useState([]);
  const [showComposer,  setShowComposer]  = useState(false);
  const [editingPost,   setEditingPost]   = useState(null);
  const [toast,         setToast]         = useState(null);
  const [connected,     setConnected]     = useState(['instagram','facebook','twitter','linkedin','tiktok']);
  const [syncing,       setSyncing]       = useState(false);
  const [showUser,      setShowUser]      = useState(false);
  const [showAI,        setShowAI]        = useState(false);
  const [showBulk,      setShowBulk]      = useState(false);

  const notify = useCallback((msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  }, []);

  // Which companies this user can see
  const userCompanies = useMemo(() => {
    if (isAdmin) return companies;
    const assigned = userAssignments[user?.email];
    if (!assigned || assigned.length === 0) return companies;
    return companies.filter(c => assigned.includes(c.id));
  }, [isAdmin, companies, userAssignments, user?.email]);

  // Posts for the active company only
  const companyPosts = useMemo(
    () => posts.filter(p => !p.companyId || p.companyId === activeCompanyId),
    [posts, activeCompanyId]
  );

  useEffect(() => {
    if (usingDemo) { setPosts(makeDemoPosts()); return; }
    if (!supabase.configured) { setPosts(makeDemoPosts()); return; }
    loadPosts();
    const unsub = supabase.subscribeToTable('posts', d => { if (d) setPosts(d.map(dbToPost)); });
    return unsub;
  }, [usingDemo]);

  const loadPosts = async () => {
    setSyncing(true);
    try { const d = await supabase.query('posts', { order: 'scheduled_date.asc' }); setPosts(d.map(dbToPost)); }
    catch { notify('Cloud sync issue', 'error'); }
    setSyncing(false);
  };

  const postToDb = p => ({
    id: p.id, user_id: user.id, content: p.content, platforms: p.platforms,
    scheduled_date: p.scheduledDate, status: p.status, post_type: p.postType,
    hashtags: p.hashtags, engagement: p.engagement, media_urls: p.mediaUrls || [],
    company_id: p.companyId || activeCompanyId,
  });
  const dbToPost = r => ({
    id: r.id, content: r.content, platforms: r.platforms || [],
    scheduledDate: r.scheduled_date, status: r.status, postType: r.post_type,
    hashtags: r.hashtags || [], engagement: r.engagement,
    category: r.category || '', mediaUrls: r.media_urls || [],
    createdBy: r.user_id, companyId: r.company_id || activeCompanyId,
  });

  const savePost = useCallback(async post => {
    const exists = posts.some(p => p.id === post.id);
    setPosts(prev => {
      const list = exists ? prev.map(p => p.id === post.id ? post : p) : [...prev, post];
      return list.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
    });
    setShowComposer(false); setEditingPost(null);
    notify(post.status === 'draft' ? 'Draft saved!' : 'Post scheduled! 🚀');
    if (!usingDemo && supabase.configured) {
      try {
        if (exists) await supabase.update('posts', post.id, postToDb(post));
        else         await supabase.insert('posts', [postToDb(post)]);
      } catch { notify('Cloud sync failed', 'error'); }
    }
  }, [posts, usingDemo, user, notify, activeCompanyId]);

  const deletePost = useCallback(async id => {
    setPosts(prev => prev.filter(p => p.id !== id));
    notify('Post deleted', 'info');
    if (!usingDemo && supabase.configured) { try { await supabase.delete('posts', id); } catch {} }
  }, [usingDemo, notify]);

  const editPost = useCallback(p => { setEditingPost(p); setShowComposer(true); }, []);
  const toggleConnect = useCallback(pid => setConnected(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]), []);

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
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <header className="header">
        <div className="header-left">
          <div className="logo-mark">P</div>
          <div className="logo-wrap">
            <h1 className="logo-text">PostPilot</h1>
            <span className="sync-status">{usingDemo ? (isAdmin ? '⚙️ Admin' : 'Demo Mode') : syncing ? 'Syncing...' : '✅ Saved'}</span>
          </div>
          <CompanySwitcher userCompanies={userCompanies} />
        </div>

        <div className="header-right">
          <button className="btn-icon" onClick={() => setShowAI(true)}   title="AI Assistant">🤖</button>
          <button className="btn-icon" onClick={() => setShowBulk(true)} title="Bulk Upload">📦</button>
          <button className="btn-new" onClick={() => { setEditingPost(null); setShowComposer(true); }}>
            <span className="btn-new-plus">+</span> New Post
          </button>
          <div className="user-wrap">
            <button className={`avatar-btn ${isAdmin ? 'avatar-admin' : ''}`} onClick={() => setShowUser(!showUser)}>{initials}</button>
            {showUser && (
              <div className="user-dropdown" onMouseLeave={() => setShowUser(false)}>
                <div className="dropdown-head">
                  <div className="dropdown-name">{dn}</div>
                  <div className="dropdown-email">{user.email}</div>
                  {isAdmin && <div className="dropdown-admin-badge">⚙️ Administrator</div>}
                </div>
                <div className="dropdown-sep" />
                {usingDemo && !isAdmin && <div className="dropdown-item dropdown-demo">💡 Demo — data not saved to cloud</div>}
                <button className="dropdown-item dropdown-signout" onClick={onSignOut}>Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="nav">
        {tabs.map(t => (
          <button key={t.id} className={`nav-btn ${tab === t.id ? 'nav-active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="nav-icon">{t.icon}</span><span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {usingDemo && !isAdmin && (
        <div className="demo-banner">
          👋 Demo Mode — <strong>sign up free</strong> to save posts to the cloud
          <button className="demo-cta" onClick={onSignOut}>Create Account →</button>
        </div>
      )}

      <main className="main">
        {tab === 'dashboard' && <Dashboard posts={companyPosts} onEdit={editPost} onNew={() => { setEditingPost(null); setShowComposer(true); }} connected={connected} />}
        {tab === 'calendar'  && <Calendar  posts={companyPosts} onEdit={editPost} onNew={d => { setEditingPost({ prefillDate: d }); setShowComposer(true); }} />}
        {tab === 'queue'     && <QueueView posts={companyPosts} onEdit={editPost} onNew={() => { setEditingPost(null); setShowComposer(true); }} />}
        {tab === 'posts'     && <PostsList posts={companyPosts} onEdit={editPost} onDelete={deletePost} />}
        {tab === 'analytics' && <Analytics posts={companyPosts} />}
        {tab === 'platforms' && <PlatformsView connected={connected} onToggle={toggleConnect} />}
        {tab === 'admin' && isAdmin && <AdminPanel />}
      </main>

      {showComposer && (
        <Composer
          post={editingPost}
          connected={connected}
          onSave={savePost}
          onClose={() => { setShowComposer(false); setEditingPost(null); }}
          companyId={activeCompanyId}
        />
      )}
      {showAI   && <AIAssistant onClose={() => setShowAI(false)} onInsert={text => { setShowAI(false); setEditingPost({ prefillContent: text }); setShowComposer(true); }} />}
      {showBulk && <BulkUpload  onClose={() => setShowBulk(false)} onImport={items => { items.forEach(p => savePost(p)); setShowBulk(false); notify(`${items.length} posts imported!`); }} connected={connected} />}
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
      <button className="co-trigger" onClick={() => setOpen(v => !v)}>
        <div className="co-badge" style={{ background: activeCompany.color }}>{activeCompany.initials}</div>
        <span className="co-name">{activeCompany.name}</span>
        <span className="co-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="co-dropdown" onMouseLeave={() => setOpen(false)}>
          <div className="co-dropdown-head">Switch Company</div>
          {userCompanies.map(co => (
            <button
              key={co.id}
              className={`co-option ${co.id === activeCompany.id ? 'co-option-active' : ''}`}
              onClick={() => { setActiveCompanyId(co.id); setOpen(false); }}
            >
              <div className="co-badge co-badge-sm" style={{ background: co.color }}>{co.initials}</div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="co-opt-name">{co.name}</div>
                <div className="co-opt-industry">{co.industry}</div>
              </div>
              {co.id === activeCompany.id && <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>}
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
  const [adminTab,      setAdminTab]      = useState('companies');
  const [showForm,      setShowForm]      = useState(false);
  const [editCo,        setEditCo]        = useState(null);
  const [newUserEmail,  setNewUserEmail]  = useState('');

  const handleSaveCompany = co => {
    if (editCo) updateCompany(co.id, co);
    else        addCompany(co);
    setShowForm(false); setEditCo(null);
  };

  const addUser = () => {
    const e = newUserEmail.trim();
    if (!e) return;
    if (!userAssignments[e]) setUserAssignments(prev => ({ ...prev, [e]: [] }));
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

      <div className="admin-tabs">
        <button className={`admin-tab ${adminTab === 'companies' ? 'admin-tab-active' : ''}`} onClick={() => setAdminTab('companies')}>
          🏢 Companies <span className="q-cat-count">{companiesCount}</span>
        </button>
        <button className={`admin-tab ${adminTab === 'users' ? 'admin-tab-active' : ''}`} onClick={() => setAdminTab('users')}>
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
                      if (companies.length <= 1) return alert('You must have at least one company.');
                      if (window.confirm(`Delete "${co.name}"? Posts will be unassigned.`)) deleteCompany(co.id);
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
            <input
              className="search-input"
              style={{ flex: 1 }}
              placeholder="Enter user email to manage..."
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addUser()}
            />
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
                    <span className="user-email-icon">✉️</span>
                    {email}
                  </div>
                  <div className="user-row-cos">
                    {companies.map(co => (
                      <label key={co.id} className={`user-co-label ${coIds.includes(co.id) ? 'user-co-label-on' : ''}`} style={coIds.includes(co.id) ? { borderColor: co.color, background: co.color + '10' } : {}}>
                        <input
                          type="checkbox"
                          checked={coIds.includes(co.id)}
                          onChange={() => toggleAssignment(email, co.id)}
                        />
                        <div className="co-badge co-badge-xs" style={{ background: co.color }}>{co.initials}</div>
                        <span>{co.name}</span>
                      </label>
                    ))}
                  </div>
                  <button className="act-btn act-del" style={{ flexShrink: 0 }} onClick={() => removeUser(email)}>✕ Remove</button>
                </div>
              ))}
            </div>
          )}

          <p className="muted" style={{ marginTop: 12, fontSize: 11, lineHeight: 1.6 }}>
            💡 Users with <strong>no assignments</strong> can see all companies. Checking companies restricts them to only those selected.
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

  const preview = (initials || name.substring(0, 2)).toUpperCase().slice(0, 2) || 'XX';

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id:       company?.id || generateId(),
      name:     name.trim(),
      industry: industry.trim(),
      color,
      initials: preview,
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-sm" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title">{company ? 'Edit Company' : 'New Company'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Company Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Marketing" autoFocus />
          </div>
          <div className="field"><label>Industry</label>
            <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Retail, Tech, Agency" />
          </div>
          <div className="comp-row">
            <div className="field" style={{ flex: 1 }}><label>Initials (2 chars)</label>
              <input value={initials} onChange={e => setInitials(e.target.value.toUpperCase().slice(0, 2))} placeholder="AM" maxLength={2} />
            </div>
            <div className="field" style={{ flex: 1 }}><label>Brand Color</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ height: 42, padding: '4px 6px', width: '100%', borderRadius: 8, border: '1.5px solid #E2E8F0' }} />
            </div>
          </div>

          {name && (
            <div className="co-preview-row">
              <div className="co-badge" style={{ background: color, width: 40, height: 40, fontSize: 15, borderRadius: 10 }}>{preview}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{industry || 'Industry'}</div>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 22px' }} onClick={save} disabled={!name.trim()}>
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
function Dashboard({ posts, onEdit, onNew, connected }) {
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

      <div className="stats-row">
        {[
          { icon: '✅', v: pub.length,              l: 'Published', c: '#059669' },
          { icon: '⏰', v: sched.length,             l: 'Scheduled', c: '#1D4ED8' },
          { icon: '📝', v: drafts.length,            l: 'Drafts',    c: '#B45309' },
          { icon: '❤️', v: tEng.toLocaleString(),    l: 'Engagement',c: '#E1306C' },
          { icon: '👁️', v: tImp.toLocaleString(),    l: 'Impressions',c: '#7C3AED' },
          { icon: '📊', v: rate + '%',               l: 'Eng. Rate', c: '#0891B2' },
        ].map(s => (
          <div key={s.l} className="stat-card">
            <div className="stat-icon" style={{ background: s.c + '12', color: s.c }}>{s.icon}</div>
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
            <div key={post.id} className="upcoming-row" onClick={() => onEdit(post)}>
              <div className="up-date">
                <span className="up-dow">{new Date(post.scheduledDate).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="up-day">{new Date(post.scheduledDate).getDate()}</span>
              </div>
              <div className="up-body">
                <p className="up-text">{post.content.substring(0, 60)}{post.content.length > 60 ? '...' : ''}</p>
                <div className="up-meta">
                  {post.platforms.slice(0, 4).map(pid => { const p = PLATFORMS.find(x => x.id === pid); return <span key={pid} className="plat-dot" style={{ background: p?.color }}>{p?.icon}</span>; })}
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
            <button className="action-btn" onClick={onNew}>📸 Upload Media & Post</button>
            <button className="action-btn" onClick={onNew}>📦 Bulk Schedule</button>
            <button className="action-btn" onClick={onNew}>🤖 AI Content Assistant</button>
          </div>

          <h3 className="card-title" style={{ marginTop: 18 }}>📊 Content Mix</h3>
          <div className="content-mix">
            {CONTENT_CATEGORIES.slice(0, 5).map(cat => {
              const count = posts.filter(p => p.category === cat.id).length;
              return (
                <div key={cat.id} className="mix-row">
                  <span className="mix-icon">{cat.icon}</span>
                  <span className="mix-name">{cat.name}</span>
                  <div className="mix-bar"><div className="mix-fill" style={{ width: `${Math.max(8, Math.min(100, count * 15))}%`, background: cat.color }} /></div>
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
  const today = new Date();

  const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  const firstDow    = new Date(cur.getFullYear(), cur.getMonth(), 1).getDay();

  const postsOnDay = day => posts.filter(p => {
    const d = new Date(p.scheduledDate);
    return d.getDate() === day && d.getMonth() === cur.getMonth() && d.getFullYear() === cur.getFullYear();
  });
  const isToday = day => today.getDate() === day && today.getMonth() === cur.getMonth() && today.getFullYear() === cur.getFullYear();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <div>
      <div className="cal-controls">
        <div className="cal-nav">
          <button className="cal-arrow" onClick={() => { const d = new Date(cur); d.setMonth(d.getMonth() - 1); setCur(d); }}>‹</button>
          <h2 className="cal-month">{cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button className="cal-arrow" onClick={() => { const d = new Date(cur); d.setMonth(d.getMonth() + 1); if (d <= maxD) setCur(d); }}>›</button>
        </div>
        <div className="cal-right">
          <span className="cal-range-badge">📅 6-month window</span>
          <div className="view-toggle">
            <button className={`vt-btn ${view === 'month' ? 'vt-active' : ''}`} onClick={() => setView('month')}>Month</button>
            <button className={`vt-btn ${view === 'week'  ? 'vt-active' : ''}`} onClick={() => setView('week')}>Week</button>
          </div>
          <button className="today-btn" onClick={() => setCur(new Date())}>Today</button>
        </div>
      </div>

      <div className="cal-grid">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-hdr">{d}</div>)}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="cal-empty" />;
          const dp      = postsOnDay(day);
          const dateObj = new Date(cur.getFullYear(), cur.getMonth(), day);
          const past    = dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          return (
            <div key={day} className={`cal-cell ${isToday(day) ? 'cal-today' : ''} ${past ? 'cal-past' : ''}`}
              onClick={() => !past && onNew(dateObj.toISOString())}>
              <span className={`cal-num ${isToday(day) ? 'cal-num-today' : ''}`}>{day}</span>
              <div className="cal-posts">
                {dp.slice(0, 3).map(post => (
                  <div key={post.id} className="cal-dot"
                    style={{ background: post.status === 'published' ? '#059669' : post.status === 'scheduled' ? '#1D4ED8' : '#B45309' }}
                    onClick={e => { e.stopPropagation(); onEdit(post); }}>
                    {post.platforms.slice(0, 2).map(pid => PLATFORMS.find(x => x.id === pid)?.icon).join('')}
                    <span className="cal-dot-time">{fmtTime(post.scheduledDate)}</span>
                  </div>
                ))}
                {dp.length > 3 && <span className="cal-more">+{dp.length - 3}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <span className="legend"><span className="ldot" style={{ background: '#059669' }} /> Published</span>
        <span className="legend"><span className="ldot" style={{ background: '#1D4ED8' }} /> Scheduled</span>
        <span className="legend"><span className="ldot" style={{ background: '#B45309' }} /> Draft</span>
        <span className="legend-hint">Click any day to schedule</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QUEUE VIEW
// ─────────────────────────────────────────────────────────────
function QueueView({ posts, onEdit, onNew }) {
  const [activeCat, setActiveCat] = useState('all');
  const scheduled  = posts.filter(p => p.status === 'scheduled' || p.status === 'draft');
  const grouped    = CONTENT_CATEGORIES.map(cat => ({ ...cat, posts: scheduled.filter(p => p.category === cat.id) }));
  const display    = activeCat === 'all' ? scheduled : scheduled.filter(p => p.category === activeCat);

  return (
    <div>
      <div className="queue-header">
        <h2 className="section-title">Content Queue</h2>
        <p className="section-sub">Organize posts by category. Queue fills automatically based on your posting schedule.</p>
      </div>
      <div className="queue-cats">
        <button className={`q-cat-btn ${activeCat === 'all' ? 'q-cat-active' : ''}`} onClick={() => setActiveCat('all')}>
          All <span className="q-cat-count">{scheduled.length}</span>
        </button>
        {CONTENT_CATEGORIES.map(cat => (
          <button key={cat.id} className={`q-cat-btn ${activeCat === cat.id ? 'q-cat-active' : ''}`}
            style={activeCat === cat.id ? { background: cat.color + '12', borderColor: cat.color, color: cat.color } : {}}
            onClick={() => setActiveCat(cat.id)}>
            {cat.icon} {cat.name} <span className="q-cat-count">{grouped.find(g => g.id === cat.id)?.posts.length || 0}</span>
          </button>
        ))}
      </div>
      <div className="queue-list">
        {display.length === 0 ? (
          <div className="empty-box"><span className="empty-icon">📭</span><p>No posts in this queue</p><button className="btn-sm" onClick={onNew}>Add content</button></div>
        ) : display.map((post, i) => (
          <div key={post.id} className="queue-item">
            <div className="qi-num">{i + 1}</div>
            <div className="qi-body">
              <p className="qi-text">{post.content.substring(0, 80)}{post.content.length > 80 ? '...' : ''}</p>
              <div className="qi-meta">
                {post.platforms.slice(0, 4).map(pid => { const p = PLATFORMS.find(x => x.id === pid); return <span key={pid} className="plat-dot" style={{ background: p?.color }}>{p?.icon}</span>; })}
                <span className="qi-date">{fmt(post.scheduledDate)} • {fmtTime(post.scheduledDate)}</span>
              </div>
            </div>
            <div className="qi-actions">
              <button className="qi-btn" onClick={() => onEdit(post)}>✏️</button>
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
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [platF,  setPlatF]  = useState('all');

  const filtered = posts.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (platF !== 'all' && !p.platforms.includes(platF)) return false;
    if (search && !p.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="filters">
        <input className="search-input" type="text" placeholder="🔍 Search posts..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-pills">
          {['all','published','scheduled','draft'].map(f => (
            <button key={f} className={`pill ${filter === f ? 'pill-active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="pill-count">{f === 'all' ? posts.length : posts.filter(p => p.status === f).length}</span>
            </button>
          ))}
        </div>
        <select className="plat-select" value={platF} onChange={e => setPlatF(e.target.value)}>
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
                <span>❤️ {post.engagement.likes}</span><span>💬 {post.engagement.comments}</span>
                <span>🔁 {post.engagement.shares}</span><span>👁️ {post.engagement.impressions?.toLocaleString()}</span>
              </div>
            )}
            <div className="pc-actions">
              <button className="act-btn" onClick={() => onEdit(post)}>✏️ Edit</button>
              <button className="act-btn" onClick={() => onEdit({ ...post, id: generateId(), status: 'draft' })}>📋 Duplicate</button>
              <button className="act-btn act-del" onClick={() => onDelete(post.id)}>🗑️ Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────
function Analytics({ posts }) {
  const pub  = posts.filter(p => p.status === 'published' && p.engagement);
  const tl   = pub.reduce((s, p) => s + (p.engagement?.likes        || 0), 0);
  const tc   = pub.reduce((s, p) => s + (p.engagement?.comments     || 0), 0);
  const ts   = pub.reduce((s, p) => s + (p.engagement?.shares       || 0), 0);
  const ti   = pub.reduce((s, p) => s + (p.engagement?.impressions  || 0), 0);
  const rate = ti > 0 ? ((tl + tc + ts) / ti * 100).toFixed(1) : '0';

  const platData = {};
  pub.forEach(p => p.platforms.forEach(pid => {
    if (!platData[pid]) platData[pid] = { posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0 };
    platData[pid].posts++;
    platData[pid].likes       += p.engagement?.likes       || 0;
    platData[pid].comments    += p.engagement?.comments    || 0;
    platData[pid].shares      += p.engagement?.shares      || 0;
    platData[pid].impressions += p.engagement?.impressions || 0;
  }));

  const topPost = [...pub].sort((a, b) => {
    const ae = (a.engagement?.likes || 0) + (a.engagement?.comments || 0);
    const be = (b.engagement?.likes || 0) + (b.engagement?.comments || 0);
    return be - ae;
  })[0];

  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const dayPosts = pub.filter(p => { const pd = new Date(p.scheduledDate); return pd.toDateString() === d.toDateString(); });
    const eng = dayPosts.reduce((s, p) => s + (p.engagement?.likes || 0) + (p.engagement?.comments || 0), 0);
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: eng };
  });
  const maxWeek = Math.max(...weekData.map(d => d.value), 1);

  return (
    <div>
      <div className="analytics-top">
        {[
          { v: tl.toLocaleString(), l: 'Total Likes',  t: '↑ 12.4%', c: '#E1306C' },
          { v: tc.toLocaleString(), l: 'Comments',     t: '↑ 8.2%',  c: '#1D4ED8' },
          { v: ts.toLocaleString(), l: 'Shares',       t: '↑ 5.7%',  c: '#059669' },
          { v: ti.toLocaleString(), l: 'Impressions',  t: '↑ 22.1%', c: '#7C3AED' },
          { v: rate + '%',          l: 'Eng. Rate',    t: '↑ 3.1%',  c: '#0891B2' },
        ].map(s => (
          <div key={s.l} className="a-stat">
            <span className="a-num">{s.v}</span>
            <span className="a-label">{s.l}</span>
            <span className="a-trend" style={{ color: s.c }}>{s.t}</span>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <div className="card">
          <h3 className="card-title">📈 Weekly Engagement</h3>
          <div className="week-chart">
            {weekData.map((d, i) => (
              <div key={i} className="wc-col">
                <div className="wc-bar-wrap">
                  <div className="wc-bar" style={{ height: `${(d.value / maxWeek) * 100}%` }} />
                  <span className="wc-val">{d.value}</span>
                </div>
                <span className="wc-label">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">📱 Platform Performance</h3>
          {Object.entries(platData).map(([pid, d]) => {
            const p  = PLATFORMS.find(x => x.id === pid); if (!p) return null;
            const te = d.likes + d.comments + d.shares;
            const w  = Math.max(6, Math.min(100, (te / Math.max(1, tl + tc + ts)) * 300));
            return (
              <div key={pid} className="pa-row">
                <div className="pa-head"><span className="pa-icon" style={{ background: p.color + '10', color: p.color }}>{p.icon}</span><span className="pa-name">{p.name}</span><span className="pa-posts">{d.posts} posts</span></div>
                <div className="pa-bar"><div className="pa-fill" style={{ width: `${w}%`, background: p.color }} /></div>
                <div className="pa-stats"><span>❤️ {d.likes}</span><span>💬 {d.comments}</span><span>🔁 {d.shares}</span><span>👁️ {d.impressions.toLocaleString()}</span></div>
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
                    {[{ v: topPost.engagement.likes, l: 'Likes' }, { v: topPost.engagement.comments, l: 'Comments' }, { v: topPost.engagement.shares, l: 'Shares' }, { v: topPost.engagement.impressions?.toLocaleString(), l: 'Impressions' }].map(s => (
                      <div key={s.l} className="tp-stat"><span className="tp-num">{s.v}</span><span className="tp-lbl">{s.l}</span></div>
                    ))}
                  </div>
                </div>
              ) : <p className="muted">Publish posts to see analytics</p>}
            </div>
            <div className="tips-wrap">
              <h3 className="card-title">💡 Content Tips</h3>
              <div className="tips">
                {['Posts with questions get 2x more comments','Visual content boosts engagement by 150%','Use 5-10 hashtags on Instagram','Post during audience peak hours','Short-form video gets 3x more shares','Consistency beats frequency'].map(t => (
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
              <div className="plat-card-icon" style={{ background: p.color + '0D' }}><span style={{ fontSize: 24 }}>{p.icon}</span></div>
              <h4 className="plat-card-name">{p.name}</h4>
              <p className="plat-card-chars">{p.maxChars.toLocaleString()} char limit</p>
              <div className="plat-card-status" style={{ color: on ? '#059669' : '#94A3B8' }}>{on ? '✅ Connected' : 'Not connected'}</div>
              <button className="plat-connect-btn" style={{ background: on ? '#FEE2E2' : p.color, color: on ? '#DC2626' : '#FFF' }} onClick={() => onToggle(p.id)}>
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
  const isEdit = post && post.id && !post.prefillDate && !post.prefillContent;
  // When editing an existing post, keep its original companyId; otherwise use activeCompanyId
  const effectiveCompanyId = isEdit ? (post.companyId || companyId) : companyId;

  const [content,     setContent]     = useState(isEdit ? post.content : (post?.prefillContent || ''));
  const [plats,       setPlats]       = useState(isEdit ? post.platforms : []);
  const [postType,    setPostType]    = useState(isEdit ? post.postType : 'Post');
  const [schedDate,   setSchedDate]   = useState(() => {
    if (isEdit)           return new Date(post.scheduledDate).toISOString().slice(0, 16);
    if (post?.prefillDate) return new Date(post.prefillDate).toISOString().slice(0, 16);
    const d = new Date(); d.setHours(d.getHours() + 1, 0); return d.toISOString().slice(0, 16);
  });
  const [hashtags,    setHashtags]    = useState(isEdit ? (post.hashtags || []).join(' ') : '');
  const [activeHash,  setActiveHash]  = useState('');
  const [category,    setCategory]    = useState(isEdit ? (post.category || '') : '');
  const [perNetwork,  setPerNetwork]  = useState({});
  const [showPerNet,  setShowPerNet]  = useState(false);

  const maxDate   = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d.toISOString().slice(0, 16); }, []);
  const charLimit = plats.length === 0 ? 5000 : Math.min(...plats.map(pid => PLATFORMS.find(x => x.id === pid)?.maxChars || 5000));
  const charCount = content.length + (hashtags ? hashtags.length + 2 : 0);

  const togglePlat = pid => setPlats(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]);
  const addHashSet = name => {
    const tags = HASHTAG_SETS[name] || [];
    const cur  = hashtags.split(' ').filter(Boolean);
    setHashtags([...new Set([...cur, ...tags])].join(' '));
    setActiveHash(name);
  };

  const save = (draft = false) => {
    if (!content.trim()) return;
    if (plats.length === 0 && !draft) return;
    const full = hashtags ? `${content}\n\n${hashtags}` : content;
    onSave({
      id: isEdit ? post.id : generateId(),
      content: full, platforms: plats,
      scheduledDate: new Date(schedDate).toISOString(),
      status: draft ? 'draft' : 'scheduled',
      postType, hashtags: hashtags.split(' ').filter(Boolean),
      engagement: isEdit ? post.engagement : null,
      category, perNetwork, mediaUrls: [],
      companyId: effectiveCompanyId,
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="composer" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title">{isEdit ? 'Edit Post' : 'Create New Post'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="comp-body">
          <div className="comp-main">
            {/* Platforms */}
            <div className="comp-section">
              <label className="comp-label">Platforms
                <span className="comp-actions">
                  <button className="tiny-btn" onClick={() => setPlats([...connected])}>All</button>
                  <button className="tiny-btn" onClick={() => setPlats([])}>Clear</button>
                </span>
              </label>
              <div className="plat-picker">
                {PLATFORMS.filter(p => connected.includes(p.id)).map(p => (
                  <button key={p.id} className={`pick-btn ${plats.includes(p.id) ? 'pick-on' : ''}`}
                    style={plats.includes(p.id) ? { background: p.color + '10', borderColor: p.color, color: p.color } : {}}
                    onClick={() => togglePlat(p.id)}>
                    {p.icon} {p.name} {plats.includes(p.id) && '✓'}
                  </button>
                ))}
              </div>
            </div>

            {/* Post Type + Category */}
            <div className="comp-row">
              <div className="comp-section" style={{ flex: 1 }}>
                <label className="comp-label">Post Type</label>
                <div className="type-picker">
                  {POST_TYPES.map(t => <button key={t} className={`type-btn ${postType === t ? 'type-active' : ''}`} onClick={() => setPostType(t)}>{t}</button>)}
                </div>
              </div>
              <div className="comp-section" style={{ flex: 1 }}>
                <label className="comp-label">Category</label>
                <select className="cat-select" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">None</option>
                  {CONTENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Content */}
            <div className="comp-section">
              <label className="comp-label">
                Content
                <span className="char-count" style={{ color: charCount > charLimit ? '#DC2626' : '#94A3B8' }}>{charCount}/{charLimit.toLocaleString()}</span>
              </label>
              <textarea className="comp-textarea" placeholder="What's on your mind? Write your post content here..." value={content} onChange={e => setContent(e.target.value)} rows={5} />
              {plats.length > 1 && (
                <button className="per-net-toggle" onClick={() => setShowPerNet(!showPerNet)}>
                  {showPerNet ? '▾ Hide' : '▸ Customize'} per-network text
                </button>
              )}
              {showPerNet && plats.map(pid => {
                const p = PLATFORMS.find(x => x.id === pid);
                return (
                  <div key={pid} className="per-net-box">
                    <label className="per-net-label" style={{ color: p?.color }}>{p?.icon} {p?.name} <span className="per-net-limit">({p?.maxChars} chars)</span></label>
                    <textarea className="per-net-textarea" placeholder={`Custom text for ${p?.name} (leave blank to use main)`}
                      value={perNetwork[pid] || ''} onChange={e => setPerNetwork(prev => ({ ...prev, [pid]: e.target.value }))} rows={3} />
                  </div>
                );
              })}
            </div>

            {/* Media */}
            <div className="comp-section">
              <label className="comp-label">Media</label>
              <div className="media-drop">
                <span style={{ fontSize: 20 }}>🖼</span>
                <p>Drag & drop images or videos</p>
                <button className="upload-btn">Browse Files</button>
                <p className="media-note">JPG, PNG, GIF, MP4, MOV • Max 100MB</p>
              </div>
            </div>

            {/* Hashtags */}
            <div className="comp-section">
              <label className="comp-label">Hashtags</label>
              <div className="hash-sets">
                {Object.keys(HASHTAG_SETS).map(s => (
                  <button key={s} className={`hash-btn ${activeHash === s ? 'hash-active' : ''}`} onClick={() => addHashSet(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <input className="hash-input" type="text" placeholder="#hashtag1 #hashtag2" value={hashtags} onChange={e => setHashtags(e.target.value)} />
            </div>

            {/* Schedule */}
            <div className="comp-section">
              <label className="comp-label">Schedule</label>
              <div className="sched-row">
                <input type="datetime-local" className="date-input" value={schedDate} onChange={e => setSchedDate(e.target.value)} max={maxDate} />
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
          <div className="comp-preview">
            <h4 className="prev-title">📱 Live Preview</h4>
            {plats.length === 0 ? <div className="prev-empty">Select platforms to preview</div> : (
              <div className="prev-phone">
                <div className="prev-head">
                  <div className="prev-avatar">R</div>
                  <div><div className="prev-user">@youraccount</div><div className="prev-ts">Scheduled • {fmt(schedDate)}</div></div>
                </div>
                <div className="prev-content">{content || <span className="muted italic">Your content here...</span>}</div>
                {hashtags && <div className="prev-hash">{hashtags}</div>}
                <div className="prev-media">{postType === 'Post' ? '🖼️' : postType === 'Video' || postType === 'Reel' ? '🎬' : '📸'} {postType} preview</div>
                <div className="prev-actions"><span>❤️ Like</span><span>💬 Comment</span><span>🔁 Share</span></div>
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
            <button className="sched-btn" onClick={() => save(false)} disabled={!content.trim() || plats.length === 0}>🚀 Schedule Post</button>
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
    setLoading(true);
    try {
      const p = PLATFORMS.find(x => x.id === platform);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `You are a social media content expert. Write a ${tone} social media post for ${p?.name || 'social media'}. Character limit: ${p?.maxChars || 2200}.\n\nTopic/prompt: ${prompt}\n\nRequirements:\n- Write ONLY the post text, no explanations\n- Include relevant emojis\n- Include a call to action\n- Add 3-5 relevant hashtags at the end\n- Stay within the character limit\n- Match the ${tone} tone perfectly` }],
        }),
      });
      const data = await res.json();
      const text = data.content?.map(c => c.text || '').join('') || 'Could not generate content.';
      setResult(text);
    } catch {
      setResult('AI generation requires an API connection. Try one of the preset templates above!');
    }
    setLoading(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="ai-modal" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title">🤖 AI Content Assistant</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
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
              <label>Tone</label>
              <select value={tone} onChange={e => setTone(e.target.value)}>
                {['professional','casual','witty','inspirational','urgent','friendly'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Platform</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)}>
                {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>What should the post be about?</label>
            <textarea className="comp-textarea" rows={3} placeholder="Describe what you want to post about..." value={prompt} onChange={e => setPrompt(e.target.value)} />
          </div>

          <button className="btn-primary" onClick={generate} disabled={loading || !prompt.trim()}>
            {loading ? '✨ Generating...' : '✨ Generate Post'}
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
    setError('');
    try {
      const lines   = csvText.trim().split('\n');
      if (lines.length < 2) return setError('Need at least a header row and one data row');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const posts   = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
        const row  = {};
        headers.forEach((h, j) => (row[h] = vals[j] || ''));
        if (!row.content) continue;
        const platIds = (row.platforms || '').split('|').filter(p => PLATFORMS.find(x => x.id === p));
        const dateStr = row.date || new Date().toISOString().slice(0, 10);
        const timeStr = row.time || '10:00';
        posts.push({
          id: generateId(), content: row.content,
          platforms: platIds.length > 0 ? platIds : [connected[0] || 'instagram'],
          scheduledDate: new Date(`${dateStr}T${timeStr}`).toISOString(),
          status: 'scheduled', postType: row.type || 'Post',
          hashtags: [], engagement: null, category: '', mediaUrls: [],
          companyId: activeCompanyId,
        });
      }
      if (posts.length === 0) return setError('No valid posts found');
      setParsed(posts);
    } catch (e) { setError('Could not parse CSV: ' + e.message); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="ai-modal" onClick={e => e.stopPropagation()}>
        <div className="comp-head">
          <h2 className="comp-title">📦 Bulk Upload (CSV)</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="ai-body">
          <p className="section-sub">Paste CSV data below. Schedule dozens of posts at once.</p>
          <div className="bulk-sample">
            <label className="comp-label">Sample Format</label>
            <pre className="sample-pre">{sampleCSV}</pre>
            <button className="tiny-btn" onClick={() => setCsvText(sampleCSV)}>Use Sample</button>
          </div>
          <div className="field">
            <label>CSV Data</label>
            <textarea className="comp-textarea" rows={8} placeholder="Paste your CSV here..." value={csvText} onChange={e => setCsvText(e.target.value)} />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn-primary" onClick={parseCSV} disabled={!csvText.trim()}>Parse CSV</button>
          {parsed.length > 0 && (
            <div className="bulk-preview">
              <label className="comp-label">Preview: {parsed.length} posts</label>
              <div className="bulk-list">
                {parsed.slice(0, 5).map((p, i) => (
                  <div key={i} className="bulk-item">
                    <span className="bulk-num">{i + 1}</span>
                    <span className="bulk-text">{p.content.substring(0, 50)}...</span>
                    <span className="bulk-date">{fmt(p.scheduledDate)}</span>
                  </div>
                ))}
                {parsed.length > 5 && <div className="muted">...and {parsed.length - 5} more</div>}
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
// DEMO DATA (distributed across companies)
// ─────────────────────────────────────────────────────────────
function makeDemoPosts() {
  const now      = new Date();
  const coIds    = DEMO_COMPANIES.map(c => c.id);
  const captions = [
    '🚀 Big things are coming! Stay tuned for our exciting announcement.',
    'Behind the scenes look at our creative process. Thoughts? 🎬',
    'Happy Monday! Start your week with positive energy ✨',
    'New product alert! 🎉 Check out what we have been working on.',
    'Thank you to our amazing community! You make it all possible 🙏',
    'Tips & tricks for better social engagement 📊',
    'Weekend vibes! How are you spending yours? 🌟',
    'Throwback to an incredible event last month! #TBT',
    'We just hit a major milestone. Here is the full story 📖',
    'What content do you want more of? Drop your ideas below 💬',
    'Our team is growing! Meet our newest member 🤝',
    'Quick poll: Morning posts or evening posts? Vote below! 🗳️',
    'Customer spotlight: See how @amazingclient uses our product 💪',
    '5 tips to boost your productivity this week 📈',
    'Flash sale alert! 24 hours only — don\'t miss out 🔥',
  ];
  const cats = ['promotional','educational','entertaining','inspirational','behindscenes','ugc','curated'];
  return Array.from({ length: 15 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() + Math.floor(Math.random() * 90) - 15);
    d.setHours(Math.floor(Math.random() * 12) + 7, Math.floor(Math.random() * 4) * 15);
    const pids = PLATFORMS.slice(0, Math.floor(Math.random() * 4) + 1).map(p => p.id);
    const st   = d < now ? 'published' : ['scheduled','draft'][Math.floor(Math.random() * 2)];
    return {
      id: generateId(), content: captions[i % captions.length], platforms: pids,
      scheduledDate: d.toISOString(), status: st, postType: POST_TYPES[Math.floor(Math.random() * 3)],
      hashtags: ['#social','#marketing','#content'],
      engagement: st === 'published' ? {
        likes: Math.floor(Math.random() * 800), comments: Math.floor(Math.random() * 120),
        shares: Math.floor(Math.random() * 60), impressions: Math.floor(Math.random() * 8000) + 500,
      } : null,
      category: cats[Math.floor(Math.random() * cats.length)],
      mediaUrls: [],
      companyId: coIds[i % coIds.length], // distribute across companies
    };
  }).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
}
