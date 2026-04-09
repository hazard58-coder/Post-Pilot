# Developer Quick Reference — Implementation Guide

## 🎯 Quick Start

**Goal**: Fix 13 critical issues in Post-Pilot, validated by comprehensive tests

**Time**: 2-3 days (16-24 hours)

**Resources**:
- [IMPLEMENTATION_FIXES.md](IMPLEMENTATION_FIXES.md) — Detailed plan
- [FIXES_CODE.js](FIXES_CODE.js) — Copy/paste ready code
- [src/__tests__/post-pilot.test.js](src/__tests__/post-pilot.test.js) — Jest tests (54 tests)
- [cypress/e2e/](cypress/e2e/) — Cypress E2E tests (72 tests)
- [AUTOMATED_TEST_REPORT.md](AUTOMATED_TEST_REPORT.md) — Detailed findings

---

## 🔴 PRIORITY 1 — Critical Fixes (12 hours)

### Fix #1: activeCompany Null Crash {#fix-1}
**Location**: [App.jsx](App.jsx#L180) Dashboard component  
**Severity**: 🔴 CRASH  

```javascript
// BEFORE:
const activeCompany = companies[0] || null;
// If companies is empty → null

// AFTER:
if (!activeCompany) {
  return <div>No companies available. Please create one.</div>;
}
```

**Test**: `npm test -- validates Dashboard guard clause`  
**Cypress**: View [cypress/e2e/features.cy.js](cypress/e2e/features.cy.js#L50)

---

### Fix #2: Past Date Scheduling Permission {#fix-2}
**Location**: [App.jsx](App.jsx#L1570) Composer component  
**Severity**: 🟠 MEDIUM  

```javascript
// BEFORE:
<input type="datetime-local" min={minDate} max={maxDate} />
// User can still submit with past date bypassing browser validation

// AFTER:
const validateScheduleDate = (dateString) => {
  const selectedDate = new Date(dateString);
  const now = new Date();
  if (selectedDate <= now) {
    return { valid: false, error: 'Cannot schedule posts in the past' };
  }
  return { valid: true };
};

// In save:
const validation = validateScheduleDate(schedDate);
if (!validation.valid) {
  setError(validation.error);
  return;
}
```

**Copy from**: [FIXES_CODE.js#L94-130](FIXES_CODE.js#L94-130)  
**Test**: `npm test -- Email Validation` (covers date validation too)  
**Cypress**: [cypress/e2e/posts.cy.js#L37](cypress/e2e/posts.cy.js#L37)

---

### Fix #3: CSV Multiline Content Parsing {#fix-3}
**Location**: [App.jsx](App.jsx#L84) parseCSVLine function  
**Severity**: 🔴 CRASH  

**Install PapaParse:**
```bash
npm install papaparse --save-dev
```

**Replace parsing:**
```javascript
// BEFORE:
const parseCSVLine = line => {
  const fields = [];
  let current = '';
  let inQuotes = false;
  // ... 30 lines of manual parsing
};

// AFTER:
import Papa from 'papaparse';

const parseCSVContent = (csvText) => {
  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
    encoding: 'UTF-8'
  });
  if (result.errors.length > 0) throw new Error(result.errors[0].message);
  return result.data;
};
```

**Copy from**: [FIXES_CODE.js#L132-180](FIXES_CODE.js#L132-180)  
**Test**: `npm test -- CSV Parsing` (8 test cases)  
**Cypress**: [cypress/e2e/csv-import.cy.js#L35](cypress/e2e/csv-import.cy.js#L35)

---

### Fix #4: Polling Doesn't Reset on Failure {#fix-4}
**Location**: [src/supabase.js](src/supabase.js#L310) subscribeToTable method  
**Severity**: 🔴 HIGH (Data Loss)  

```javascript
// BEFORE:
const poll = async () => {
  const data = await this.query(table, { filters });
  lastFetch = new Date().toISOString(); // ← Always resets!
  callback(data);
};

// AFTER:
const poll = async () => {
  try {
    const data = await this.query(table, { filters });
    if (Array.isArray(data)) {
      callback(data);
      lastFetch = new Date().toISOString(); // ← Only on success
    }
  } catch (e) {
    // lastFetch NOT updated — retry same window
  }
};
```

**Copy from**: [FIXES_CODE.js#L182-220](FIXES_CODE.js#L182-220)  
**Test**: Manual networking test  
**Cypress**: [cypress/e2e/features.cy.js#L110](cypress/e2e/features.cy.js#L110)

---

### Fix #5: savePost Missing User Validation {#fix-5}
**Location**: [App.jsx](App.jsx#L540) savePost callback  
**Severity**: 🔴 HIGH (Data Corruption)  

```javascript
// BEFORE:
const savePost = useCallback(async post => {
  const dbRow = postToDb(post, user.id, ...); // user.id might be undefined
  await supabase.insert('posts', [dbRow]);
}, [user]);

// AFTER:
const savePost = useCallback(async post => {
  if (!user || !user.id) {
    notify('Session expired. Please sign in again.', 'error');
    handleSignOut();
    return;
  }
  
  const previousPosts = postsRef.current; // Save for rollback
  const dbRow = postToDb(post, user.id, ...);
  try {
    await supabase.insert('posts', [dbRow]);
  } catch (e) {
    setPosts(previousPosts); // Rollback on error
    notify(`Cloud sync failed: ${e.message}. Changes reverted.`, 'error');
  }
}, [user]);
```

**Copy from**: [FIXES_CODE.js#L222-280](FIXES_CODE.js#L222-280)  
**Test**: Jest: `Post CRUD Operations`  
**Cypress**: [cypress/e2e/posts.cy.js#L84](cypress/e2e/posts.cy.js#L84)

---

### Fix #6: Email Validation Too Permissive {#fix-6}
**Location**: [App.jsx](App.jsx#L100) isValidEmail function  
**Severity**: 🟠 MEDIUM  

```javascript
// BEFORE:
const isValidEmail = email =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).toLowerCase());
// Accepts: test@domain.c (1-char TLD), test..name@domain.com (double dot)

// AFTER:
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(trimmed)) return false;
  
  const [localPart, domain] = trimmed.split('@');
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  
  if (!domain.includes('.')) return false;
  
  const labels = domain.split('.');
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    if (!/^[a-z0-9-]+$/i.test(label)) return false;
  }
  
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  
  return true;
};
```

**Copy from**: [FIXES_CODE.js#L420-460](FIXES_CODE.js#L420-460)  
**Test**: `npm test -- Email Validation` (15 test cases)  
**Cypress**: [cypress/e2e/auth.cy.js](cypress/e2e/auth.cy.js)

---

## 🟠 PRIORITY 2 — High Priority Fixes (6 hours)

### Quick Reference Table

| Fix | Time | File | Issue | Test |
|-----|------|------|-------|------|
| #7 | 30m | supabase.js | Session expiry not detected | [session-test](src/__tests__/post-pilot.test.js#L200) |
| #8 | 30m | App.jsx | Company deletion orphans posts | [cypress/e2e/features.cy.js#L180](cypress/e2e/features.cy.js#L180) |
| #9 | 45m | App.jsx | Toast messages stack | Manual test |
| #10 | 1h | App.jsx | Textarea allows 100KB input | Add maxLength=40000 |
| #11 | 1h | App.jsx | AI generation rate limits | [cypress/e2e/posts.cy.js#L200](cypress/e2e/posts.cy.js#L200) |
| #12 | 1h | App.jsx | Modal overlap possible | [cypress/e2e/features.cy.js#L90](cypress/e2e/features.cy.js#L90) |
| #13 | 30m | App.jsx | Empty CSV no error | [cypress/e2e/csv-import.cy.js#L250](cypress/e2e/csv-import.cy.js#L250) |

---

## 📋 Testing Checklist

### Before Implementing
- [ ] Read [AUTOMATED_TEST_REPORT.md](AUTOMATED_TEST_REPORT.md) findings
- [ ] Review [FIXES_CODE.js](FIXES_CODE.js) implementations
- [ ] Install dependencies: `npm install papaparse`

### During Implementation
- [ ] Make one fix at a time
- [ ] Run unit tests after each fix: `npm test`
- [ ] Check console for errors: `npm run dev`
- [ ] Run Cypress tests for that feature

### After All Fixes
```bash
# Unit tests
npm test

# Cypress tests
npx cypress run

# Build check
npm run build

# Production preview
npm run preview
```

---

## 🎬 Step-by-Step Implementation

### Day 1: Critical Path (8 hours)

**1. Setup (30m)**
```bash
git checkout -b fix/critical-issues
npm install papaparse
npm test -- --watch  # Keep tests running in background
```

**2. Fix #1: activeCompany Crash (45m)**
- Open [App.jsx](App.jsx#L180)
- Add guard clause before Dashboard renders
- Test: `npm test` should still pass
- Manual: View dashboard with no companies

**3. Fix #2: Date Validation (1h)**
- Add `validateScheduleDate()` from [FIXES_CODE.js](FIXES_CODE.js#L94)
- Call in Composer `save()` function
- Test: `npm test -- "Date Validation"`
- Manual: Try scheduling past date

**4. Fix #3: CSV Parser (2h)**
- Install PapaParse: `npm install papaparse`
- Replace `parseCSVLine()` in [App.jsx](App.jsx#L84)
- Update `BulkUpload` component
- Test: `npm test -- "CSV Parsing"`
- Manual: Upload multiline CSV

**5. Fix #4: Polling Sync (1h)**
- Edit [src/supabase.js](src/supabase.js#L310)
- Update polling logic
- Test: Monitor network tab for polling
- Manual: Kill Supabase connection, verify retry

**6. Fix #5: User Validation (1h)**
- Edit [App.jsx](App.jsx#L540) savePost
- Add user check and rollback
- Test: `npm test`
- Manual: Logout mid-post, verify error

**7. Fix #6: Email Validation (1h)**
- Replace `isValidEmail()` in [App.jsx](App.jsx#L100)
- Test: `npm test -- "Email Validation"`
- Manual: Try invalid emails

**End of Day 1**: Run `npm test` → All unit tests should pass

---

### Day 2: High Priority (8 hours)

**1-7. Apply remaining fixes** (reference table above)

**After each fix:**
```bash
npm test  # Verify no regression
```

**End of Day 2**: Run `npx cypress run` → E2E tests should pass

---

### Day 3: Validation (6 hours)

**1. Full Test Suite (1h)**
```bash
npm test                    # Jest: 54/54 passing
npx cypress run             # Cypress: 72/72 passing
npm run build               # Production build succeeds
```

**2. Manual Smoke Testing (2h)**
- Sign up new account
- Create post with all platforms
- Import CSV with 100 rows
- Switch companies
- Delete company
- View analytics
- Try all error scenarios

**3. Performance Check (1h)**
```bash
npm run build
du -sh dist/               # Check bundle size
```

**4. Security Audit (1h)**
- Check no secrets in bundle: `grep -r "VITE_ADMIN" dist/`
- Verify environment vars not hardcoded
- Check CSP headers in Vercel config

**5. Deploy to Staging (1h)**
```bash
npm run build
vercel --prod               # Deploy to preview
```

**6. Final Validation (1h)**
- Run E2E against staging: `CYPRESS_BASE_URL=https://staging npx cypress run`
- Monitor error logs
- Verify analytics working

---

## 🧪 Quick Test Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- post-pilot.test.js

# Run specific test suite
npm test -- --testNamePattern="Email Validation"

# Watch mode (auto-rerun on save)
npm test -- --watch

# Cypress open (interactive mode)
npx cypress open

# Cypress headless
npx cypress run

# Cypress single file
npx cypress run --spec="cypress/e2e/auth.cy.js"

# Check for regressions
npm test -- --coverage   # See code coverage
```

---

## 🐛 Troubleshooting

### Issue: "Module not found: papaparse"
```bash
npm install papaparse --save-dev
```

### Issue: Tests fail after fix
1. Check console errors: `npm run dev`
2. Review the fix in [FIXES_CODE.js](FIXES_CODE.js)
3. Ensure all code was copied correctly
4. Run: `npm test -- --verbose`

### Issue: Cypress can't find elements
1. Verify selectors exist: `npx cypress open`
2. Check app is running: `npm run dev`
3. Increase timeout if needed: `cy.contains('text', { timeout: 10000 })`

### Issue: Test behavior differs locally vs CI
1. Check env vars: `echo $VITE_SUPABASE_URL`
2. Clear node_modules: `rm -rf node_modules && npm install`
3. Clear cache: `npm test -- --clearCache`

---

## 📊 Progress Tracking

Track fixes as you implement:

```
Phase 1: Critical Fixes
- [ ] Fix #1: activeCompany null check
- [ ] Fix #2: Past date validation  
- [ ] Fix #3: CSV parser upgrade
- [ ] Fix #4: Polling timestamp
- [ ] Fix #5: savePost user validation
- [ ] Fix #6: Email validation

Phase 2: High Priority
- [ ] Fix #7: Session expiry
- [ ] Fix #8: Company deletion
- [ ] Fix #9: Toast queue
- [ ] Fix #10: Textarea maxLength
- [ ] Fix #11: AI debounce
- [ ] Fix #12: Modal state
- [ ] Fix #13: Empty CSV error

Phase 3: Validation
- [ ] Unit tests pass (54/54)
- [ ] Cypress tests pass (72/72)
- [ ] Build succeeds
- [ ] Staging deployment verification
```

---

## 📞 Support

**Need help?**
1. Check [AUTOMATED_TEST_REPORT.md](AUTOMATED_TEST_REPORT.md) for detailed issue description
2. Review [FIXES_CODE.js](FIXES_CODE.js) for exact implementation
3. Look at test in [src/__tests__/post-pilot.test.js](src/__tests__/post-pilot.test.js) for expected behavior
4. Run Cypress test interactively: `npx cypress open`

**File Structure:**
```
Post-Pilot/
├── src/
│   ├── App.jsx                    ← Main fixes here
│   ├── supabase.js               ← Polling fix here
│   └── __tests__/
│       └── post-pilot.test.js     ← 54 Jest tests
├── cypress/
│   └── e2e/
│       ├── auth.cy.js
│       ├── posts.cy.js
│       ├── csv-import.cy.js
│       └── features.cy.js
├── AUTOMATED_TEST_REPORT.md       ← Issue details
├── FIXES_CODE.js                  ← Copy/paste implementations
├── IMPLEMENTATION_FIXES.md        ← Detailed roadmap
└── QUICK_REFERENCE.md            ← ← YOU ARE HERE
```

---

**Good luck! You've got this. 🚀**
