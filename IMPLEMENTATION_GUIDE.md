# Implementation Guide — Production-Ready Post-Pilot

## Quick Start Checklist

### Phase 1: CRITICAL Fixes (Deploy Before Going Live)

- [ ] **Remove admin credentials from build** (vite.config.js)
  - Move admin auth to backend JWT claims
  - Use Supabase custom claims system
  - Never compile secrets into bundles

- [ ] **Fix RLS policies** (supabase/migrations/002_rls_policies.sql)
  - Replace with improved multi-tenant version
  - Add `user_company_assignments` table
  - Test that users cannot see other companies' posts

- [ ] **Implement optimistic update rollback** (src/App.jsx)
  - Save pre-state before mutations
  - Rollback on API failure
  - Show user clear error + recovery options

- [ ] **Add input validation & sanitization** (src/utils-improved.js)
  - Validate all CSV inputs before insert
  - Sanitize user content (use DOMPurify)
  - Validate email addresses properly

- [ ] **Fix SQL injection vulnerabilities** (src/supabase.js)
  - Use improved supabase-improved.js
  - Validate column names and operators
  - Use proper PostgREST API format

- [ ] **Remove exposed secrets** (ALL FILES)
  - Scan for hardcoded API keys, passwords
  - Use environment variables properly
  - Never log sensitive data

### Phase 2: HIGH Priority Fixes (Complete Before First Users)

- [ ] Add retry logic with exponential backoff
  - Implement in App.jsx (savePost, deletePost, loadPosts)
  - Use fetchWithRetry from supabase-improved.js
  - Handle rate limiting gracefully

- [ ] Implement proper error classification
  - Use classifyError() utility
  - Show actionable user messages
  - Log errors to monitoring service

- [ ] Add comprehensive logging
  - Set up Sentry or LogRocket
  - Track error rates and types
  - Monitor API performance

- [ ] Enforce multi-tenant isolation at database level
  - Test RLS policies thoroughly
  - Verify users cannot access other companies' data
  - Document test cases

- [ ] Add offline detection & queue
  - Monitor navigator.onLine
  - Queue mutations when offline
  - Retry when connection restored

### Phase 3: MEDIUM Priority Fixes (Complete Within 1 Month)

- [ ] Add unit tests
  - Jest + React Testing Library
  - Test all validation functions
  - Test error boundary
  - Minimum 70% coverage of critical paths

- [ ] Add E2E tests
  - Cypress or Playwright
  - Test auth flow (signup, login, logout)
  - Test post creation → scheduling → publish
  - Test multi-user scenarios

- [ ] Virtualize long lists
  - Install react-window
  - Virtualize Post Lists, Calendar
  - Implement pagination

- [ ] Set up database backups
  - Enable Supabase backups
  - Test restore procedure
  - Document backup schedule

- [ ] Implement audit logging
  - Log all post mutations (create, update, delete)
  - Record who did what and when
  - Enable for compliance

### Phase 4: NICE-TO-HAVE Improvements (Plan for Later)

- [ ] Add real-time WebSocket instead of polling
- [ ] Implement draft auto-save
- [ ] Add media upload to cloud storage
- [ ] Implement full-text search
- [ ] Add calendar event integration
- [ ] Implement team collaboration features

---

## Environment Variables (Production)

Create `.env.local` with these values:

```env
# REQUIRED
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# OPTIONAL (leave blank to disable demo mode)
VITE_DEMO_ENABLED=false

# DO NOT INCLUDE (move to backend):
# VITE_ADMIN_USERNAME
# VITE_ADMIN_PASSWORD
```

---

## Deployment Checklist

### Before Deploying to Production

```bash
# 1. Run security audit
npm audit
npm install --save-dev snyk
snyk test

# 2. Run linter
npm install --save-dev eslint
npm run lint

# 3. Build for production
npm run build

# 4. Check bundle size
npm install --save-dev webpack-bundle-analyzer
npm run analyze

# 5. Run tests
npm test -- --coverage

# 6. Test E2E scenarios
npx cypress run
```

### Vercel/AWS Deployment

1. **Set environment variables in CI/CD:**
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   ANTHROPIC_API_KEY (for /api/generate)
   ```

2. **Ensure RLS policies applied:**
   ```bash
   psql -h db.<PROJECT>.supabase.co -U postgres -d postgres
   # Run migrations/002_rls_policies-improved.sql
   # Run migrations/003_add_per_network.sql
   ```

3. **Enable Supabase security features:**
   - Enable database backups
   - Set up RLS policies ✅
   - Enable JWT verification
   - Configure CORS whitelist

4. **Monitor and alert:**
   - Set up error tracking (Sentry)
   - Set up performance monitoring (DataDog, New Relic)
   - Set up uptime monitoring

---

## Testing Strategy

### Unit Tests (Jest)
- Test utilities: `isValidEmail()`, `parseCSVLine()`, date parsing
- Test error classification
- Test ID generation
- Target: 100% coverage of utils

### Integration Tests
- Test auth flow (signup, login, logout)
- Test post creation → scheduling → published
- Test multi-company access control
- Test optimistic update rollback
- Target: 80% coverage of critical paths

### E2E Tests (Cypress)
- Test full user journeys
- Test error recovery flows
- Test performance under load
- Test cross-browser compatibility

### Security Tests
- SQL injection attempts
- XSS payload injection
- CSRF protection
- RLS policy bypasses
- Use OWASP ZAP scanner

---

## Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Bundle Size | < 500KB | ~400KB | ✅ |
| First Paint | < 2s | Unknown | ❓ |
| Time to Interactive | < 3s | Unknown | ❓ |
| API Latency p95 | < 500ms | Unknown | ❓ |
| Database Query p95 | < 200ms | Unknown | ❓ |
| Lighthouse Score | > 90 | Unknown | ❓ |

### Performance Improvements
- [ ] Enable code splitting (React.lazy + Suspense)
- [ ] Implement list virtualization
- [ ] Enable gzip compression
- [ ] Add service worker caching
- [ ] Optimize images/media
- [ ] Implement pagination

---

## Monitoring & Alerting

### Metrics to Track
1. **Error Rate:** Alert if > 1% of requests fail
2. **API Latency:** Alert if p95 > 2s
3. **Database Connections:** Alert if > 80% of pool
4. **Authentication Failures:** Alert if > 10/minute
5. **Rate Limit Events:** Alert if frequent

### Tools Recommended
- **Error Tracking:** Sentry or Rollbar
- **Performance:** DataDog, New Relic, or Vercel Analytics
- **Uptime:** Pingdom or StatusPage
- **Logs:** LogRocket or Loggly

---

## Scaling Considerations

### Current Limitations
- No pagination → loads all posts
- Polling every 8 seconds → doesn't scale with users
- All posts rendered at once → performance degrades

### Solutions for Scale
1. **Database:** 
   - Implement pagination (offset + limit)
   - Add composite indexes on (company_id, scheduled_date)
   - Partition posts by date/company

2. **Frontend:**
   - Virtualize lists (react-window)
   - Lazy load modals (React.lazy)
   - Use React Query for data caching

3. **Backend:**
   - Replace polling with WebSocket subscriptions
   - Implement caching layer (Redis)
   - Add API rate limiting

4. **Infrastructure:**
   - Use CDN for static assets
   - Enable database connection pooling
   - Monitor and scale based on metrics

---

## Security Hardening Checklist

- [ ] Remove all hardcoded secrets from code
- [ ] Enable HTTPS only
- [ ] Set secure HTTP headers (CSP, X-Frame-Options, etc.)
- [ ] Implement CORS whitelist
- [ ] Enable database encryption at rest
- [ ] Implement DDoS protection (Cloudflare)
- [ ] Regular security audits (quarterly)
- [ ] Keep dependencies up-to-date
- [ ] Implement 2FA for admin accounts
- [ ] Document security policies

---

## Post-Launch Support

### Week 1
- Monitor error rates and performance
- Respond to user feedback
- Fix critical bugs
- Monitor database size

### Month 1
- Analyze usage patterns
- Optimize based on real-world data
- Implement quick wins
- Plan roadmap

### Ongoing
- Monthly security updates
- Quarterly security audits
- Performance optimization
- Feature prioritization

---

## Budget Estimation

| Service | Free Tier | Production | Monthly Cost |
|---------|-----------|------------|---|
| Supabase | 500MB DB | 1GB+ | $25-100 |
| Vercel | 100GB bandwidth | 1TB+ | $20-100 |
| Anthropic API | None | $0.02/1K tokens | $100-500 |
| Sentry | 5K errors/month | Unlimited | $29 |
| DataDog | None | Full stack | $50-200 |
| **Total** | Free | **Production** | **~$300-1000/mo** |

---

## Support & Escalation

### For Users
- In-app help documentation
- Email support (support@postpilot.app)
- Status page (status.postpilot.app)

### For Technical Issues
- GitHub issues for bug reports
- Slack channel for internal comms
- Weekly engineering sync-ups

---

## Sign-Off Checklist

Before declaring production-ready:

- [ ] All CRITICAL fixes implemented and tested
- [ ] RLS policies verified to prevent data leaks
- [ ] Error handling robust across all flows
- [ ] Comprehensive logging set up
- [ ] Database backups configured
- [ ] Monitoring and alerting active
- [ ] Security audit completed
- [ ] Performance targets met
- [ ] 95% of tests passing
- [ ] Documentation complete

---

**Status:** 🔴 NOT PRODUCTION-READY  
**Target Date:** June 1, 2026  
**Owner:** Engineering Team  
**Last Updated:** April 9, 2026
