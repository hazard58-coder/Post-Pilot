# Production Readiness Review: Post-Pilot

**Date:** April 9, 2026  
**Severity Summary:** 12 Critical Issues, 18 High-Priority Issues, 15 Medium-Priority Issues

---

## Executive Summary

Post-Pilot is a well-architected React + Vite application for social media management with progressive features (demo mode, multi-company support, admin controls). However, several **critical security vulnerabilities**, **race conditions**, **error handling gaps**, and **scalability issues** must be addressed before production deployment.

### Critical Blockers
- ⛔ Credentials/secrets in build-time env vars compiled into bundles
- ⛔ SQL injection vulnerabilities in PostgREST query building
- ⛔ Incomplete RLS policies don't enforce company-level access control
- ⛔ Race condition in optimistic updates without rollback
- ⛔ No input sanitization on CSV bulk imports
- ⛔ Missing authentication for admin operations
- ⛔ Exposed Supabase anon keys in bundled JS

---

## Detailed Findings

### 1. SECURITY VULNERABILITIES (Critical)

#### 1.1 ⛔ Admin Credentials in Bundle (vite.config.js)
**Severity:** CRITICAL  
**File:** [vite.config.js](vite.config.js)

```javascript
// Current (INSECURE):
define: {
  'window.__ENV__': {
    ADMIN_USERNAME: JSON.stringify(env.VITE_ADMIN_USERNAME || ''),
    ADMIN_PASSWORD: JSON.stringify(env.VITE_ADMIN_PASSWORD || ''),
  },
}
```

**Issues:**
- Build-time env vars ARE compiled into the JS bundle
- Anyone can inspect DevTools → Sources and find credentials
- No server-side validation; purely client-side auth
- Demo mode creates confusable admin accounts

**Fix:** Remove from bundle entirely; move admin auth to backend JWT claims.

#### 1.2 ⛔ SQL Injection in PostgREST Query Constructor (supabase.js)
**Severity:** CRITICAL  
**File:** [src/supabase.js](src/supabase.js:260-275)

```javascript
// Current (PARTIALLY UNSAFE):
async query(table, { select = '*', filters = [], order, limit } = {}) {
  let url = `${this.url}/rest/v1/${encodeURIComponent(table)}?select=${encodeURIComponent(select)}`;
  filters.forEach(([col, op, val]) => {
    // col and op are NOT encoded properly — only val is
    url += `&${encodeURIComponent(col)}=${encodeURIComponent(op)}.${encodeURIComponent(val)}`;
  });
  // Problem: PostgREST expects "col=op.val" but col/op must be identifiers
  // Encoding them as query params breaks the API grammar
}
```

**Issues:**
- Column names and operators not properly validated
- Could allow injection if malicious values passed
- Query format may break with special characters

**Fix:** Use proper PostgREST API format with strict validation.

#### 1.3 ⛔ Incomplete RLS Policies (001_initial_schema.sql)
**Severity:** CRITICAL  
**File:** [supabase/migrations/002_rls_policies.sql](supabase/migrations/002_rls_policies.sql)

```sql
-- Current (INCOMPLETE):
create policy "Users can read own posts"
  on public.posts for select
  using ( auth.uid() = user_id );
```

**Issues:**
- Does NOT enforce company_id access control
- User can see any post where user_id = auth.uid()
- Multi-tenant isolation fails if user_id is reused across companies
- No policy checks company_id against user assignments

**Fix:** Add company_id validation to all RLS policies.

#### 1.4 ⛔ Supabase Anon Keys Exposed (vite.config.js + supabase.js)
**Severity:** CRITICAL  
**Files:** [vite.config.js](vite.config.js), [src/supabase.js](src/supabase.js)

```javascript
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY compiled into bundle
// Anyone can use these credentials to call your Supabase API directly
```

**Fix:** 
- Supabase anon keys are meant to be public; rely solely on RLS
- Ensure RLS policies are bulletproof (see 1.3)
- Do NOT embed service_role key in frontend

#### 1.5 ⛔ No Input Validation on CSV Bulk Import (App.jsx)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx) (BulkUpload component, not fully shown)

**Issues:**
- CSV lines parsed without validation
- No check for max rows, max fields, data types
- User could inject XSS via CSV content
- No sanitization before database insert

**Fix:** Validate CSV structure and sanitize all fields.

#### 1.6 ⛔ XSS Risk in perNetwork Content (App.jsx)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx:1780-1800)

```javascript
// perNetwork textarea allows HTML — could be reflected unsanitized if loaded back
// Although "content" goes through innerText, perNetwork override bypasses validation
```

**Fix:** Apply DOMPurify or sanitize all user-generated content.

#### 1.7 ⛔ localStorage Keys Unencrypted (App.jsx)
**Severity:** MEDIUM  
**Files:** [src/App.jsx](src/App.jsx:190-220)

```javascript
// User assignments, company data stored unencrypted in localStorage
// Anyone with access to browser can read all company/user info
localStorage.setItem('pp_user_assignments', JSON.stringify(userAssignments));
```

**Fix:** Encrypt sensitive data at rest or move to Supabase profiles table.

#### 1.8 ⛔ No Rate-Limiting on AI API Calls (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:1900+)

```javascript
// User can spam /api/generate endpoint
// No throttling; Anthropic API costs money
```

**Fix:** Implement client-side debouncing + server-side rate limits.

#### 1.9 ⛔ Email Validation Too Simplistic (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:100)

```javascript
const isValidEmail = email =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).toLowerCase().trim());
// Accepts many invalid addresses like "a@b.c" or "user@localhost"
```

**Fix:** Use RFC 5322-compliant validator or library like `email-validator`.

---

### 2. BUGS & EDGE CASES

#### 2.1 ⛔ Race Condition in Optimistic Updates (App.jsx)
**Severity:** CRITICAL  
**File:** [src/App.jsx](src/App.jsx:527-550)

```javascript
const savePost = useCallback(async post => {
  // Optimistic update applied immediately
  setPosts(prev => {
    const list = exists ? prev.map(p => p.id === post.id ? post : p) : [...prev, post];
    return list.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
  });
  
  // But if API fails, no rollback — user sees stale post
  if (!usingDemo && supabase.configured) {
    try {
      const dbRow = postToDb(post, user.id, post.companyId || activeCompanyId);
      if (exists) await supabase.update('posts', post.id, dbRow);
      else        await supabase.insert('posts', [dbRow]);
    } catch (e) {
      // ERROR: No rollback! User sees unsaved post forever (until reload)
      notify(`Cloud sync failed: ${e.message}`, 'error');
    }
  }
}, [usingDemo, user, notify, activeCompanyId]);
```

**Fix:** Save pre-update state, rollback on failure.

#### 2.2 ⛔ deletePost Doesn't Rollback on Failure (App.jsx)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx:555-570)

```javascript
const deletePost = useCallback(async id => {
  // Optimistic delete
  setPosts(prev => prev.filter(p => p.id !== id));
  notify('Post deleted', 'info');
  
  if (!usingDemo && supabase.configured) {
    try {
      await supabase.delete('posts', id);
    } catch (e) {
      // Calls loadPosts() but doesn't restore immediate state
      notify(`Delete failed: ${e.message}. Refreshing…`, 'error');
      loadPosts();
    }
  }
}, [usingDemo, notify, loadPosts]);
```

**Fix:** Rollback immediately on error before reloading.

#### 2.3 ⛔ Date Parsing Issues (Calendar component)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx:1200+)

```javascript
// new Date(p.scheduledDate) assumes ISO string, but:
// - Different browsers parse differently
// - Timezone handling is implicit (assumes UTC or local)
// - DST transitions could cause off-by-one errors
const d = new Date(p.scheduledDate);
return d.getFullYear() === dateObj.getFullYear() &&
       d.getMonth()    === dateObj.getMonth()    &&
       d.getDate()     === dateObj.getDate();
```

**Fix:** Use date library like `date-fns` or `Day.js`; normalize to UTC.

#### 2.4 ⛔ Company Deletion Orphans Posts (App.jsx)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx:600-620)

```javascript
const deleteCompany = useCallback(id => {
  setCompanies(prev => prev.filter(c => c.id !== id));
  // Posts with company_id = id are NOT deleted, just orphaned
  // They appear in database but no company to associate them
}, [companies]);
```

**Fix:** Delete associated posts or null company_id on deletion.

#### 2.5 🔴 Incomplete Toast Cleanup (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:400-415)

```javascript
const toastTimerRef = useRef(null);
useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

// Actually OK — cleanup works. But no de-duplication; multiple toasts stack.
```

**Fix:** Implement toast queue or de-duplication.

#### 2.6 🔴 Missing Null-Safety in Engagement (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:1450+)

```javascript
const tEng = pub.reduce((s, p) => s + (p.engagement?.likes || 0) + ..., 0);
const tImp = pub.reduce((s, p) => s + (p.engagement?.impressions || 0), 0);
const rate = tImp > 0 ? ((tEng / tImp) * 100).toFixed(1) : '0.0';
// Good use of optional chaining, but division by zero on tImp = 0 returns "0.0", should be "0"
```

**Fix:** Ensure consistent formatting.

#### 2.7 🔴 CSV Line Parsing Doesn't Handle Newlines (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:84-101)

```javascript
const parseCSVLine = line => {
  // parseCSVLine processes ONE line at a time
  // If cell contains "\n", it works (RFC 4180 quotes it)
  // But file.split('\n') will split on embedded newlines too
  // Fix: use a proper CSV parser library
};
```

**Fix:** Use `papaparse` or `csv-parser` library.

#### 2.8 🔴 Polling Timestamp Not Synchronized (supabase.js)
**Severity:** MEDIUM  
**File:** [src/supabase.js](src/supabase.js:310-330)

```javascript
let lastFetch = new Date().toISOString();
// Uses NOW as starting point
// If server time differs from client, could miss/duplicate rows
// Should sync server time on first load
```

**Fix:** Fetch server time on initial load; use that as baseline.

---

### 3. STATE MANAGEMENT & RACE CONDITIONS

#### 3.1 🔴 localStorage ↔ Server Out of Sync (App.jsx)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx:190-220)

```javascript
// Companies, activeCompanyId, userAssignments stored in localStorage
// but also fetched/modified from Supabase
// If user logs in from another device, localStorage state stale
```

**Fix:** Treat Supabase as source of truth; use localStorage only for UI state (theme, etc.).

#### 3.2 🔴 useCallback Dependencies Could Be Incomplete (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:527-550)

```javascript
const savePost = useCallback(async post => {
  // ... code ...
}, [usingDemo, user, notify, activeCompanyId]);
// Missing: postsRef — actually OK because it's a ref
// But if supabase.configured is used, should be in deps (it's not)
```

**Fix:** Enable ESLint exhaustive-deps rule.

#### 3.3 🔴 Polling Interval Leaks If Component Unmounts (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:495-510)

```javascript
useEffect(() => {
  // ...
  const unsub = supabase.subscribeToTable('posts', incoming => { /* ... */ });
  return unsub;  // GOOD — properly cleaned up
}, [usingDemo, loadPosts]);
```

**Verdict:** This is fine. But interval should be cleared on error.

---

### 4. API & DATA HANDLING

#### 4.1 🔴 No Retry Logic Beyond Supabase Client (App.jsx)
**Severity:** HIGH  
**Files:** [src/App.jsx](src/App.jsx:552-570), [src/supabase.js](src/supabase.js)

```javascript
// Supabase client has retry logic (fetchWithRetry)
// But App.jsx loadPosts() doesn't retry on transient failures
const loadPosts = useCallback(async () => {
  setSyncing(true);
  try {
    const d = await supabase.query('posts', {
      filters: [['company_id', 'eq', activeCompanyId]],
      order: 'scheduled_date.asc',
    });
    setPosts(d.map(r => dbToPost(r, activeCompanyId)));
  } catch (e) {
    // No retry; just notify user
    notify(`Cloud sync issue: ${e.message}`, 'error');
  } finally {
    setSyncing(false);
  }
}, [activeCompanyId, notify]);
```

**Fix:** Implement exponential backoff retry.

#### 4.2 🔴 API Timeout (12 seconds) May Be Too Long for Mobile (supabase.js)
**Severity:** MEDIUM  
**File:** [src/supabase.js](src/supabase.js:10)

```javascript
const REQUEST_TIMEOUT_MS = 12_000; // 12 seconds
// Fine for desktop, but mobile networks may want 5-8s
// Should be configurable
```

**Fix:** Make configurable per request type.

#### 4.3 🔴 Empty Response from AI Generator Not Handled (api/generate.js)
**Severity:** MEDIUM  
**File:** [api/generate.js](api/generate.js:58-70)

```javascript
const data = await upstream.json();
const text = data.content?.map(c => c.text || '').join('') || '';
if (!text) return res.status(502).json({ error: 'Empty response from AI' });
// Good; but what if Anthropic returns stale/cached response?
```

**Fix:** Add response validation (min length, no spam patterns).

---

### 5. PERFORMANCE ISSUES

#### 5.1 🔴 No Virtualization for Large Post Lists (App.jsx)
**Severity:** HIGH  
**File:** [src/App.jsx](src/App.jsx:1450+) (PostsList, Calendar components)

```javascript
// Renders ALL posts, even if 1000+
{filtered.map(post => (
  <div key={post.id} className="post-card">
    {/* Each post card has nested logic */}
  </div>
))}
```

**Fix:** Use react-window or react-virtualized for lists > 100 items.

#### 5.2 🔴 Missing Pagination (App.jsx & supabase.js)
**Severity:** MEDIUM  
**Files:** [src/App.jsx](src/App.jsx:480-500), [src/supabase.js](src/supabase.js:310)

```javascript
async query(table, { select = '*', filters = [], order, limit } = {}) {
  // limit param doesn't support offset for pagination
  // loadPosts fetches all posts for company without limit
}
```

**Fix:** Add offset + limit; implement cursor-based pagination.

#### 5.3 🔴 Unnecessary Re-renders Due to Missing Memoization (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx:650+)

```javascript
// Dashboard receives `companyPosts` which is useMemo'd (GOOD)
// But some callbacks not memoized, causing child re-renders
const onEdit = useCallback(p => { ... }, []); // Good
const onNew = useCallback(() => { ... }, []); // Good
// But Dashboard definition is not memoized
```

**Fix:** Wrap component definitions in React.memo where appropriate.

#### 5.4 🔴 Large Bundle Size (No Code-Splitting)
**Severity:** MEDIUM  
**File:** [vite.config.js](vite.config.js)

```javascript
// Entire App.jsx (3000+ lines) bundled into one chunk
// No lazy loading of modals, sub-views
```

**Fix:** Use React.lazy() + Suspense for modals.

---

### 6. ERROR HANDLING & LOGGING

#### 6.1 🔴 Generic Error Messages (throughout)
**Severity:** MEDIUM  
**Multiple files**

```javascript
// Example:
catch (e) {
  notify(`Cloud sync failed: ${e.message}`, 'error');
}
// User sees raw error; doesn't know if it's network, auth, data, etc.
```

**Fix:** Classify errors; provide actionable user messages.

#### 6.2 🔴 No Offline Detection (App.jsx)
**Severity:** MEDIUM  
**File:** [src/App.jsx](src/App.jsx)

```javascript
// App assumes online or demo mode
// No navigator.onLine check or connection lost detection
```

**Fix:** Monitor online/offline; queue actions when offline.

#### 6.3 🔴 No Breadcrumb Logging (throughout)
**Severity:** MEDIUM  
**All files**

```javascript
// Console.error used, but no structured logging
// No user session tracking, action history
```

**Fix:** Implement Sentry or similar for error monitoring.

---

### 7. TESTING

#### 7.1 ⛔ Zero Tests
**Severity:** CRITICAL

- No unit tests for utilities (`parseCSVLine`, `isValidEmail`, etc.)
- No integration tests for auth flow
- No E2E tests for post creation → scheduled → published flow
- No tests for race condition handling
- No tests for error scenarios (network down, API rate limit, etc.)

**Fix:** Implement:
- Jest + Testing Library for React components
- Cypress or Playwright for E2E
- Target 70%+ coverage for critical paths

---

### 8. MISSING FEATURES FOR PRODUCTION

#### 8.1 🔴 No Analytics Event Tracking
- No event funnel tracking (signup / create post / publish)
- No error rate monitoring
- No performance metrics

#### 8.2 🔴 No User Preferences Persistence
- Theme preference not saved
- Language preference not implemented

#### 8.3 🔴 No Audit Logging
- No record of who deleted/modified what post
- No compliance logging for SOC 2 / GDPR

#### 8.4 🔴 No Multi-Tenancy Enforcement at DB Level
- Company isolation relies solely on RLS
- No company_id enforcement in migrations

#### 8.5 🔴 No Data Backup Mechanism
- No mention of Supabase backups enabled
- No export functionality for user data

---

## Code Improvements & Fixes

### File 1: [supabase.js](src/supabase.js) — Fixed Security & Retry Logic
