// ═════════════════════════════════════════════════════════════
// APP.JSX FIXES — Critical Issues & Edge Cases
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// FIX #1: activeCompany Null Crash
// ─────────────────────────────────────────────────────────────
// BEFORE (Line 180-190):
/*
const activeCompany = useMemo(
  () => companies.find(c => c.id === activeCompanyId) || companies[0] || null,
  [companies, activeCompanyId]
);
*/

// AFTER:
const activeCompany = useMemo(
  () => companies.find(c => c.id === activeCompanyId) || companies[0] || null,
  [companies, activeCompanyId]
);

// Add this safeguard in Dashboard component:
function Dashboard({ posts, onEdit, onNew, onAI, onBulk, connected }) {
  const { activeCompany } = useCompany();
  
  // NEW: Add guard clause
  if (!activeCompany) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '400px',
        gap: 12,
        textAlign: 'center',
        color: '#64748B'
      }}>
        <div style={{ fontSize: 40 }}>🏢</div>
        <h2 style={{ fontWeight: 600, color: '#0F172A' }}>No Company Selected</h2>
        <p>Create or select a company to continue.</p>
      </div>
    );
  }
  
  // REST OF COMPONENT...
}

// ─────────────────────────────────────────────────────────────
// FIX #2: CSV Parsing for Multiline Content
// ─────────────────────────────────────────────────────────────
// BEFORE (Line 84-101):
/*
const parseCSVLine = line => {
  const fields = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
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
*/

// AFTER: Use PapaParse library
// npm install papaparse
import Papa from 'papaparse';

const parseCSVContent = (csvText) => {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('CSV content is required');
  }
  
  // Use PapaParse for RFC 4180 compliance
  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
    encoding: 'UTF-8'
  });
  
  if (result.errors && result.errors.length > 0) {
    throw new Error(`CSV parsing error: ${result.errors[0].message}`);
  }
  
  return result.data; // Returns array of arrays
};

// For single line parsing (fallback):
const parseCSVLine = (line) => {
  if (!line) return [];
  const result = Papa.parse(line);
  return result.data[0] || [];
};

// ─────────────────────────────────────────────────────────────
// FIX #3: Past Date Validation
// ─────────────────────────────────────────────────────────────
// BEFORE (Composer component, around line 1570):
/*
<input
  id="sched-date"
  type="datetime-local"
  className="date-input"
  value={schedDate}
  onChange={e => setSchedDate(e.target.value)}
  min={minDate}
  max={maxDate}
/>
*/

// AFTER: Add validation function and check
const validateScheduleDate = (dateString) => {
  if (!dateString) return { valid: false, error: 'Date is required' };
  
  const selectedDate = new Date(dateString);
  const now = new Date();
  
  // Must be in the future
  if (selectedDate <= now) {
    return { 
      valid: false, 
      error: 'Cannot schedule posts in the past' 
    };
  }
  
  // Must be within 6 months
  const sixMonthsFromNow = new Date(now);
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  
  if (selectedDate > sixMonthsFromNow) {
    return { 
      valid: false, 
      error: 'Cannot schedule more than 6 months ahead' 
    };
  }
  
  return { valid: true };
};

// In save function:
const save = (isDraft) => {
  if (!isDraft) {
    const validation = validateScheduleDate(schedDate);
    if (!validation.valid) {
      setContentErr(validation.error);
      return;
    }
  }
  // Continue with save...
};

// ─────────────────────────────────────────────────────────────
// FIX #4: Polling Timestamp Should Only Update on Success
// ─────────────────────────────────────────────────────────────
// File: src/supabase.js, subscribeToTable method
// BEFORE:
/*
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
      lastFetch = new Date().toISOString();  // 🔴 WRONG: Resets even if failure
      callback(data);
    }
  } catch {
    // Polling errors are non-fatal; retry next interval
  }
};
*/

// AFTER:
const poll = async () => {
  if (!active || !this.accessToken) return;
  try {
    const filters = [['updated_at', 'gt', lastFetch]];
    const data = await this.query(table, {
      filters,
      order: 'scheduled_date.asc',
      limit: 500,
    });
    
    if (active && Array.isArray(data) && data.length > 0) {
      // ✅ FIXED: Only update timestamp if we got successful response with data
      callback(data);
      lastFetch = new Date().toISOString();
    } else if (active && Array.isArray(data)) {
      // No new data, still update lastFetch to avoid infinite polling
      lastFetch = new Date().toISOString();
    }
  } catch (e) {
    console.warn(`[Polling] Error fetching ${table}:`, e.message);
    // Polling errors are non-fatal; retry next interval
    // lastFetch NOT updated — will retry same window
  }
};

// ─────────────────────────────────────────────────────────────
// FIX #5: Validate user.id Before Database Operations
// ─────────────────────────────────────────────────────────────
// BEFORE (App.jsx, savePost callback around line 540):
/*
const savePost = useCallback(async post => {
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
      const dbRow = postToDb(post, user.id, post.companyId || activeCompanyId);  // 🔴 user.id might be undefined
      if (exists) await supabase.update('posts', post.id, dbRow);
      else        await supabase.insert('posts', [dbRow]);
    } catch (e) {
      notify(`Cloud sync failed: ${e.message}`, 'error');
    }
  }
}, [usingDemo, user, notify, activeCompanyId]);
*/

// AFTER:
const savePost = useCallback(async post => {
  // ✅ NEW: Validate user still authenticated
  if (!user || !user.id) {
    notify('Session expired. Please sign in again.', 'error');
    handleSignOut();
    return;
  }
  
  const exists = postsRef.current.some(p => p.id === post.id);
  
  // Optimistic update
  const previousPosts = postsRef.current;
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
      // ✅ ROLLBACK on error
      setPosts(previousPosts);
      notify(`Cloud sync failed: ${e.message}. Changes reverted.`, 'error');
    }
  }
}, [usingDemo, user, notify, activeCompanyId]);

// ─────────────────────────────────────────────────────────────
// FIX #6: Company Deletion Cleanup & Warning
// ─────────────────────────────────────────────────────────────
// BEFORE (App.jsx, AdminPanel component, around line 850):
/*
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
*/

// AFTER: Add post count warning
<button className="act-btn act-del" onClick={() => {
  if (companies.length <= 1) {
    setConfirm({ 
      message: 'You must have at least one company.', 
      confirmLabel: 'OK', 
      danger: false, 
      onConfirm: () => setConfirm(null) 
    });
    return;
  }
  
  // ✅ NEW: Count posts for this company
  const postsCount = posts.filter(p => p.companyId === co.id).length;
  const message = postsCount > 0 
    ? `Delete "${co.name}"? This will orphan ${postsCount} post${postsCount !== 1 ? 's' : '}.`
    : `Delete "${co.name}"?`;
  
  setConfirm({
    message,
    confirmLabel: 'Delete Company',
    onConfirm: () => { deleteCompany(co.id); setConfirm(null); },
    danger: true
  });
}}>🗑️ Delete</button>

// ─────────────────────────────────────────────────────────────
// FIX #7: Textarea maxLength to Prevent Memory Issues
// ─────────────────────────────────────────────────────────────
// BEFORE (Composer component, around line 1500):
/*
<textarea
  id="comp-content"
  className="comp-textarea"
  placeholder="What's on your mind? Write your post content here…"
  value={content}
  onChange={e => { setContent(e.target.value); setContentErr(''); }}
  rows={5}
/>
*/

// AFTER:
<textarea
  id="comp-content"
  className="comp-textarea"
  placeholder="What's on your mind? Write your post content here…"
  value={content}
  onChange={e => { setContent(e.target.value); setContentErr(''); }}
  rows={5}
  maxLength={40000}  // ✅ NEW: Hard limit
  aria-describedby={contentErr ? 'content-error' : 'char-count'}
/>

// ─────────────────────────────────────────────────────────────
// FIX #8: Toast Queue to Prevent Message Stacking
// ─────────────────────────────────────────────────────────────
// BEFORE (MainApp, around line 400):
/*
const [toast, setToast] = useState(null);
// ...
const notify = useCallback((msg, type = 'success') => {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  setToast({ msg, type });
  toastTimerRef.current = setTimeout(() => setToast(null), 3500);
}, []);
*/

// AFTER:
const [toasts, setToasts] = useState([]);  // Changed to array
const toastTimerRef = useRef(null);

const notify = useCallback((msg, type = 'success') => {
  const id = Date.now();
  const newToast = { id, msg, type };
  
  // ✅ NEW: Queue toasts, keep only latest 3
  setToasts(prev => {
    const updated = [...prev, newToast];
    return updated.slice(-3);  // Keep max 3 toasts
  });
  
  // Auto-remove after delay
  setTimeout(() => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, 3500);
}, []);

// Update render:
{toasts.map(toast => (
  <div key={toast.id} className={`toast toast-${toast.type}`} role="status" aria-live="polite">
    {toast.msg}
  </div>
))}

// ─────────────────────────────────────────────────────────────
// FIX #9: Better Email Validation
// ─────────────────────────────────────────────────────────────
// BEFORE (App.jsx, around line 100):
/*
const isValidEmail = email =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).toLowerCase().trim());
*/

// AFTER: Comprehensive validation
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const trimmed = email.trim().toLowerCase();
  
  // Basic length
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  
  // Overall pattern
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(trimmed)) return false;
  
  // Split and validate
  const [localPart, domain] = trimmed.split('@');
  
  // Local part rules
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  
  // Domain rules
  if (!domain.includes('.')) return false;
  
  const labels = domain.split('.');
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    if (!/^[a-z0-9-]+$/i.test(label)) return false;
  }
  
  // TLD must be 2+ chars
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  
  return true;
};

// ─────────────────────────────────────────────────────────────
// FIX #10: Debounce AI Generation to Prevent Rate Limits
// ─────────────────────────────────────────────────────────────
// BEFORE (AIAssistant component, around line 1900):
/*
const generate = async () => {
  if (!prompt.trim()) return;
  setLoading(true); setResult(''); setAiError('');
  // ...
};

// Button:
<button className="ai-gen-btn" onClick={generate} disabled={loading}>
  Generate
</button>
*/

// AFTER:
// Add debounce helper at top of file
const debounce = (fn, delayMs) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
};

function AIAssistant({ onClose, onInsert }) {
  // ... existing state ...
  const [isGenerating, setIsGenerating] = useState(false);
  
  const generate = async () => {
    if (!prompt.trim()) return;
    if (isGenerating) return;  // Prevent double-click
    
    setIsGenerating(true);
    setLoading(true);
    setResult('');
    setAiError('');
    abortRef.current = new AbortController();
    
    try {
      const p = PLATFORMS.find(x => x.id === platform);
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
      if (e.name === 'AbortError') return;
      setAiError(
        e.message.includes('not configured')
          ? 'AI service not configured. Add ANTHROPIC_API_KEY to Vercel env.'
          : `Generation failed: ${e.message}`
      );
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  };

  // ✅ NEW: Debounced version
  const generateDebounced = useCallback(debounce(generate, 500), []);

  // Button:
  <button 
    className="ai-gen-btn" 
    onClick={generateDebounced}  // Use debounced version
    disabled={loading || isGenerating || !prompt.trim()}
  >
    {loading ? 'Generating…' : 'Generate'}
  </button>
}

// ─────────────────────────────────────────────────────────────
// FIX #11: CSV Empty Line Handling
// ─────────────────────────────────────────────────────────────
// When parsing bulk CSV, filter empty lines:

const parseCSVPosts = (csvText, companyId) => {
  if (!csvText) throw new Error('CSV content required');
  
  // ✅ Filter empty lines
  const lines = csvText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && l.length > 0);  // Skip empty
  
  if (lines.length < 2) {
    throw new Error('CSV must have header + at least 1 data row');
  }
  
  // Rest of parsing...
  const headers = parseCSVLine(lines[0]);
  const posts = [];
  
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    // Validate and add post...
  }
  
  return posts;
};

// ─────────────────────────────────────────────────────────────
// FIX #12: Modal Overlap Prevention
// ─────────────────────────────────────────────────────────────
// BEFORE: Multiple modals could render at once
// AFTER: Ensure only one modal active

// In MainApp render:
{activeModal === 'composer' && (
  <Composer
    // ...
  />
)}
{activeModal === 'ai' && (  // NOT "||" that would allow both!
  <AIAssistant
    // ...
  />
)}
{activeModal === 'bulk' && (
  <BulkUpload
    // ...
  />
)}

// This structure already prevents overlap ✅

// ─────────────────────────────────────────────────────────────
// FIX #13: Add Session Expiry Handler
// ─────────────────────────────────────────────────────────────
// Add to MainApp effect:

useEffect(() => {
  // Monitor for session expiry
  const checkSession = () => {
    const sessionStr = localStorage.getItem('pp_session');
    if (!sessionStr) {
      // Session lost
      setUser(null);
      notify('Session expired. Please sign in again.', 'error');
    }
  };
  
  const interval = setInterval(checkSession, 60000);  // Check every minute
  return () => clearInterval(interval);
}, []);

export default PostPilotApp;
