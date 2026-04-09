# Post-Pilot DevOps Setup Guide

## Overview

This guide covers the production-ready DevOps configuration for Post-Pilot, including environment management, monitoring, security, and deployment strategies.

## 🚨 Critical Security Notice

**DO NOT DEPLOY** until all CRITICAL items in the production checklist are completed. The application currently has admin credentials exposed in the client bundle.

## Environment Setup

### 1. Environment Variables

Copy `.env.example` to `.env.production` and configure:

```bash
# Required
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-prod-anon-key
ANTHROPIC_API_KEY=sk-ant-api03-your-prod-key

# Security (change these!)
VITE_ADMIN_USERNAME=your-admin-user
VITE_ADMIN_PASSWORD=your-secure-admin-pass

# Monitoring
VITE_SENTRY_DSN=https://your-prod-sentry-dsn@sentry.io/project
```

### 2. Environment Validation

Run validation before deployment:

```bash
npm run validate-env
```

## Security Configuration

### Content Security Policy

The application includes comprehensive CSP headers:

- Blocks inline scripts and styles
- Restricts external connections to approved domains
- Prevents XSS attacks
- Enforces HTTPS

### Authentication Security

- Admin credentials removed from client bundle
- Secure session management
- Input validation and sanitization
- Rate limiting on API endpoints

## Monitoring & Error Tracking

### Sentry Integration

1. Create a Sentry project at https://sentry.io
2. Add the DSN to `VITE_SENTRY_DSN`
3. Errors are automatically captured and reported

### Performance Monitoring

- Core Web Vitals tracking
- React performance profiling
- API response time monitoring

## Deployment Options

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

### Option 2: Docker

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or build manually
docker build -t postpilot .
docker run -p 3000:80 postpilot
```

### Option 3: Manual Deployment

```bash
# Build for production
npm run build:production

# Serve with any static hosting
# nginx, Apache, etc.
```

## CI/CD Pipeline

### GitHub Actions Setup

1. Add repository secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID_STAGING`
   - `VERCEL_PROJECT_ID_PRODUCTION`
   - `SNYK_TOKEN`

2. The pipeline includes:
   - Automated testing
   - Security scanning
   - Linting
   - Deployment to staging/production

## Database Optimization

### Performance Indexes

Run the migration for production:

```sql
-- Apply performance indexes
psql -f supabase/migrations/004_performance_indexes.sql
```

### Connection Pooling

Supabase handles connection pooling automatically. Monitor query performance in the Supabase dashboard.

## Scaling Considerations

### Vertical Scaling
- Increase Vercel function memory limits
- Upgrade Supabase plan for higher limits

### Horizontal Scaling
- Use Vercel's global CDN
- Implement caching strategies
- Consider API rate limiting

### Database Scaling
- Monitor query performance
- Use appropriate indexes
- Consider read replicas for high traffic

## Backup & Recovery

### Database Backups
Supabase provides automatic backups. Configure additional backups for critical data.

### Application Backups
- Code is version controlled
- Build artifacts can be recreated
- User data is in Supabase

## Monitoring & Alerting

### Key Metrics to Monitor
- Application response times
- Error rates
- Database query performance
- API rate limit usage

### Alert Conditions
- Error rate > 1%
- Response time > 2 seconds
- Database connection issues

## Security Best Practices

### Regular Updates
- Keep dependencies updated
- Monitor security advisories
- Regular security audits

### Access Control
- Least privilege principle
- Regular credential rotation
- Multi-factor authentication

### Data Protection
- Encrypt sensitive data
- Implement proper data retention
- GDPR compliance

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check environment variables
   - Verify Node.js version
   - Clear node_modules and rebuild

2. **Runtime Errors**
   - Check Sentry for error details
   - Verify API endpoints
   - Check network connectivity

3. **Performance Issues**
   - Monitor Core Web Vitals
   - Check database query performance
   - Review bundle size

### Debug Commands

```bash
# Validate environment
npm run validate-env

# Run security scan
npm run security-scan

# Monitor deployment
npm run monitor-deployment

# Check bundle size
npm run build && npx vite-bundle-analyzer dist
```

## Production Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Security scan passed
- [ ] Tests passing
- [ ] Admin credentials changed
- [ ] Sentry configured

### Deployment
- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Gradual traffic rollout

### Post-Deployment
- [ ] Enable monitoring alerts
- [ ] Set up log aggregation
- [ ] Configure backups
- [ ] Document runbooks

## Support

For issues or questions:
1. Check this documentation
2. Review Sentry error reports
3. Check Vercel deployment logs
4. Monitor Supabase dashboard

## Cost Optimization

### Monthly Estimates
- Vercel Pro: $20-100
- Supabase Pro: $25-100
- Sentry Team: $29
- Anthropic API: $100-500

### Optimization Tips
- Monitor usage patterns
- Implement caching
- Optimize bundle size
- Use appropriate resource limits