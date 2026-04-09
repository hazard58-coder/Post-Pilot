# DevOps Production Readiness Report: Post-Pilot

**Date:** April 9, 2026  
**Application:** Post-Pilot (React + Vite + Supabase + Vercel)  
**Status:** 🔴 NOT PRODUCTION-READY

---

## Executive Summary

Post-Pilot requires significant DevOps improvements before production deployment. Current setup lacks monitoring, proper environment management, security hardening, and scalability considerations. This report provides a comprehensive production readiness plan.

### Critical Issues Found
- ❌ Environment variables exposed in client bundle
- ❌ No error tracking or monitoring
- ❌ Missing rate limiting and security headers
- ❌ No CI/CD pipeline
- ❌ No containerization strategy
- ❌ Insufficient logging and observability

### Estimated Timeline
- **Phase 1 (Week 1):** Security & Environment (Critical)
- **Phase 2 (Week 2):** Monitoring & Logging (High Priority)
- **Phase 3 (Week 3):** CI/CD & Deployment (Medium Priority)
- **Phase 4 (Week 4):** Scaling & Performance (Optimization)

---

## 1. ENVIRONMENT VARIABLE HANDLING

### Current Issues
- ❌ Admin credentials compiled into client bundle
- ❌ No environment validation
- ❌ Secrets mixed with public config
- ❌ No runtime environment detection

### Required Changes

#### 1.1 Secure Environment Configuration

**File:** `src/config/env.js` (NEW)
```javascript
// Secure environment configuration with validation
const ENV_SCHEMA = {
  // Public (safe for client bundle)
  VITE_SUPABASE_URL: { required: true, pattern: /^https:\/\/.*\.supabase\.co$/ },
  VITE_SUPABASE_ANON_KEY: { required: true, pattern: /^eyJ/ },
  VITE_DEMO_ENABLED: { required: false, default: 'false' },
  
  // Server-only (never in bundle)
  ANTHROPIC_API_KEY: { required: true, serverOnly: true },
  
  // Build-time only (not in bundle)
  VITE_ADMIN_USERNAME: { buildTime: true },
  VITE_ADMIN_PASSWORD: { buildTime: true },
};

export function validateEnvironment() {
  const errors = [];
  const env = { ...process.env, ...import.meta.env };
  
  for (const [key, config] of Object.entries(ENV_SCHEMA)) {
    const value = env[key];
    
    if (config.required && !value) {
      errors.push(`Missing required environment variable: ${key}`);
    }
    
    if (value && config.pattern && !config.pattern.test(value)) {
      errors.push(`Invalid format for ${key}`);
    }
    
    if (config.serverOnly && typeof window !== 'undefined') {
      errors.push(`${key} should not be in client bundle`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  
  return env;
}

export const env = validateEnvironment();
```

#### 1.2 Improved Vite Configuration

**File:** `vite.config.js` (UPDATED)
```javascript
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateEnvironment } from './src/config/env.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Validate environment on build
  if (mode === 'production') {
    validateEnvironment();
  }
  
  return {
    plugins: [react()],
    define: {
      // Only include safe, public environment variables
      'window.__ENV__': {
        SUPABASE_URL: JSON.stringify(env.VITE_SUPABASE_URL || ''),
        SUPABASE_ANON_KEY: JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
        DEMO_ENABLED: JSON.stringify(env.VITE_DEMO_ENABLED || 'false'),
        // Remove admin credentials from bundle
        // ADMIN_USERNAME: JSON.stringify(env.VITE_ADMIN_USERNAME || ''),
        // ADMIN_PASSWORD: JSON.stringify(env.VITE_ADMIN_PASSWORD || ''),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            supabase: ['supabase'],
          },
        },
      },
    },
  };
});
```

#### 1.3 Environment Files Structure

**File:** `.env.example` (UPDATED)
```bash
# ─── Supabase (Public - Safe for client bundle) ─────────────────
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key

# ─── Feature Flags (Public) ────────────────────────────────────
VITE_DEMO_ENABLED=false

# ─── Admin Credentials (Build-time only - NOT in bundle) ──────
# These are used during build to inject admin auth logic
# They are NOT included in the final bundle
VITE_ADMIN_USERNAME=your-admin-username
VITE_ADMIN_PASSWORD=your-secure-admin-password

# ─── AI Service (Server-side only - NEVER in bundle) ──────────
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# ─── Monitoring & Analytics ────────────────────────────────────
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
VITE_ANALYTICS_ID=GA_MEASUREMENT_ID

# ─── Build Configuration ──────────────────────────────────────
NODE_ENV=production
VITE_APP_VERSION=1.0.0
```

---

## 2. LOGGING AND MONITORING SETUP

### Required Implementations

#### 2.1 Client-Side Error Tracking

**File:** `src/config/sentry.js` (NEW)
```javascript
import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured');
    return;
  }
  
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    
    // Performance monitoring
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    
    // Error filtering
    beforeSend(event, hint) {
      // Filter out network errors that are expected
      if (event.exception?.values?.[0]?.value?.includes('Network Error')) {
        return null;
      }
      return event;
    },
    
    // User context
    integrations: [
      new Sentry.BrowserTracing({
        tracePropagationTargets: ['localhost', /^https:\/\/.*\.supabase\.co/],
      }),
    ],
  });
}

export function setUserContext(user) {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.user_metadata?.display_name,
    });
  } else {
    Sentry.setUser(null);
  }
}

export function logError(error, context = {}) {
  console.error('[PostPilot Error]', error, context);
  Sentry.captureException(error, { extra: context });
}

export function logEvent(name, properties = {}) {
  console.log(`[PostPilot Event] ${name}`, properties);
  Sentry.captureMessage(name, {
    level: 'info',
    extra: properties,
  });
}
```

#### 2.2 Server-Side Logging

**File:** `api/_middleware.js` (NEW)
```javascript
// Vercel Edge Middleware for logging and security
import { NextResponse } from 'next/server';

export function middleware(request) {
  const start = Date.now();
  const { pathname, searchParams } = new URL(request.url);
  
  // Log incoming requests (excluding health checks)
  if (!pathname.includes('/_next/') && !pathname.includes('/favicon')) {
    console.log(`[${new Date().toISOString()}] ${request.method} ${pathname}`, {
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      country: request.headers.get('x-vercel-ip-country'),
    });
  }
  
  const response = NextResponse.next();
  
  // Add response timing
  response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/_next/ (Next.js internals)
     * - _next/static (static files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/_next/|_next/static|favicon.ico).*)',
  ],
};
```

#### 2.3 Performance Monitoring

**File:** `src/hooks/usePerformance.js` (NEW)
```javascript
import { useEffect } from 'react';
import * as Sentry from '@sentry/react';

export function usePerformance() {
  useEffect(() => {
    // Monitor Core Web Vitals
    if ('web-vitals' in window) {
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(console.log);
        getFID(console.log);
        getFCP(console.log);
        getLCP(console.log);
        getTTFB(console.log);
      });
    }
    
    // Monitor React performance
    if (import.meta.env.DEV) {
      const reportWebVitals = (metric) => {
        console.log('Web Vital:', metric);
        
        // Send to monitoring service
        Sentry.captureMessage(`Web Vital: ${metric.name}`, {
          level: 'info',
          extra: {
            value: metric.value,
            rating: metric.rating,
            delta: metric.delta,
          },
        });
      };
      
      // In production, you'd send these to your analytics service
      reportWebVitals({ name: 'test', value: 100, rating: 'good', delta: 0 });
    }
  }, []);
}

export function measurePerformance(name, fn) {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    
    // Send to monitoring
    Sentry.captureMessage(`Performance: ${name}`, {
      level: 'info',
      extra: { duration },
    });
    
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`[Performance Error] ${name}: ${duration.toFixed(2)}ms`, error);
    Sentry.captureException(error, { extra: { duration, operation: name } });
    throw error;
  }
}
```

---

## 3. ERROR TRACKING STRATEGY

### Implementation Plan

#### 3.1 Global Error Boundary

**File:** `src/components/ErrorBoundary.jsx` (UPDATED)
```javascript
import React from 'react';
import * as Sentry from '@sentry/react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = Math.random().toString(36).substr(2, 9);
    
    console.error('[PostPilot] Unhandled error:', error, errorInfo);
    
    // Send to Sentry with additional context
    Sentry.captureException(error, {
      contexts: {
        error_boundary: {
          errorId,
          componentStack: errorInfo.componentStack,
        },
        user: {
          // Add user context if available
        },
      },
      tags: {
        component: 'ErrorBoundary',
        error_id: errorId,
      },
    });
    
    this.setState({ errorId });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>Error ID: {this.state.errorId}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
          {import.meta.env.DEV && (
            <details>
              <summary>Error Details (Dev Only)</summary>
              <pre>{this.state.error?.toString()}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default Sentry.withErrorBoundary(ErrorBoundary, {
  fallback: ({ error, resetError }) => (
    <div className="error-fallback">
      <h2>An error occurred</h2>
      <button onClick={resetError}>Try again</button>
    </div>
  ),
});
```

#### 3.2 API Error Handling

**File:** `src/utils/apiErrorHandler.js` (NEW)
```javascript
import * as Sentry from '@sentry/react';

export class APIError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.response = response;
  }
}

export function handleAPIError(error, context = {}) {
  // Classify error type
  let errorType = 'unknown';
  let userMessage = 'An unexpected error occurred';
  let shouldRetry = false;
  
  if (error.status) {
    switch (error.status) {
      case 400:
        errorType = 'validation';
        userMessage = 'Invalid request. Please check your input.';
        break;
      case 401:
        errorType = 'auth';
        userMessage = 'Authentication required. Please sign in.';
        break;
      case 403:
        errorType = 'permission';
        userMessage = 'You don\'t have permission to perform this action.';
        break;
      case 404:
        errorType = 'not_found';
        userMessage = 'The requested resource was not found.';
        break;
      case 429:
        errorType = 'rate_limit';
        userMessage = 'Too many requests. Please try again later.';
        shouldRetry = true;
        break;
      case 500:
      case 502:
      case 503:
        errorType = 'server';
        userMessage = 'Server error. Please try again later.';
        shouldRetry = true;
        break;
      default:
        errorType = 'http';
        userMessage = `Request failed (${error.status})`;
    }
  } else if (error.name === 'NetworkError') {
    errorType = 'network';
    userMessage = 'Network error. Check your connection.';
    shouldRetry = true;
  }
  
  // Log to Sentry
  Sentry.captureException(error, {
    tags: {
      error_type: errorType,
      http_status: error.status,
    },
    extra: {
      ...context,
      userMessage,
      shouldRetry,
      response: error.response,
    },
  });
  
  // Log to console in development
  if (import.meta.env.DEV) {
    console.error('[API Error]', {
      type: errorType,
      status: error.status,
      message: error.message,
      context,
    });
  }
  
  return {
    type: errorType,
    message: userMessage,
    shouldRetry,
    originalError: error,
  };
}

export function withErrorHandling(fn, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const handled = handleAPIError(error, context);
      throw handled;
    }
  };
}
```

---

## 4. DEPLOYMENT READINESS

### Docker Configuration

**File:** `Dockerfile` (NEW)
```dockerfile
# Multi-stage build for optimal image size
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DEMO_ENABLED=false
ARG VITE_ADMIN_USERNAME
ARG VITE_ADMIN_PASSWORD
ARG VITE_APP_VERSION

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_DEMO_ENABLED=$VITE_DEMO_ENABLED
ENV VITE_ADMIN_USERNAME=$VITE_ADMIN_USERNAME
ENV VITE_ADMIN_PASSWORD=$VITE_ADMIN_PASSWORD
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

# Production stage
FROM nginx:alpine AS runner

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**File:** `nginx.conf` (NEW)
```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;
    
    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.anthropic.com; font-src 'self'; frame-ancestors 'none';" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    server {
        listen 80;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;
        
        # Handle client-side routing
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        # API routes (if using nginx for API proxy)
        location /api/ {
            proxy_pass http://api:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

**File:** `docker-compose.yml` (NEW)
```yaml
version: '3.8'

services:
  postpilot:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
        VITE_DEMO_ENABLED: ${VITE_DEMO_ENABLED:-false}
        VITE_ADMIN_USERNAME: ${VITE_ADMIN_USERNAME}
        VITE_ADMIN_PASSWORD: ${VITE_ADMIN_PASSWORD}
        VITE_APP_VERSION: ${VITE_APP_VERSION:-1.0.0}
    ports:
      - "3000:80"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: API service if not using Vercel
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.api
    ports:
      - "3001:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
    depends_on:
      - postpilot
```

### CI/CD Pipeline

**File:** `.github/workflows/ci-cd.yml` (NEW)
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run tests
      run: npm run test -- --coverage
      env:
        CI: true
    
    - name: Build application
      run: npm run build
      env:
        VITE_SUPABASE_URL: https://test.supabase.co
        VITE_SUPABASE_ANON_KEY: test-key
        VITE_DEMO_ENABLED: true
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info

  security:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit --audit-level high
    
    - name: Run Snyk
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high

  deploy-staging:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Vercel (Staging)
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_STAGING }}
        working-directory: ./
        vercel-args: '--prod=false'

  deploy-production:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Vercel (Production)
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_PRODUCTION }}
        working-directory: ./
        vercel-args: '--prod=true'
```

---

## 5. SCALABILITY UNDER LOAD

### Database Optimization

**File:** `supabase/migrations/004_performance_indexes.sql` (NEW)
```sql
-- Performance indexes for high-traffic scenarios

-- Composite index for posts queries (most common)
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_company_status_scheduled_idx 
  ON public.posts (company_id, status, scheduled_date DESC);

-- Partial index for active posts only
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_active_idx 
  ON public.posts (company_id, scheduled_date) 
  WHERE status IN ('scheduled', 'published');

-- Index for user posts (less common but important)
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_user_scheduled_idx 
  ON public.posts (user_id, scheduled_date DESC);

-- Index for platform filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_platforms_idx 
  ON public.posts USING GIN (platforms);

-- Index for hashtag searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_hashtags_idx 
  ON public.posts USING GIN (hashtags);

-- Index for engagement queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_engagement_idx 
  ON public.posts ((engagement->>'likes')::int DESC)
  WHERE status = 'published';

-- Update statistics for better query planning
ANALYZE public.posts;
```

### API Rate Limiting

**File:** `api/_middleware.js` (UPDATED)
```javascript
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

// Rate limiter instance
const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
});

export async function middleware(request) {
  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);
    
    if (!success) {
      return new Response('Rate limit exceeded', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      });
    }
    
    // Add rate limit headers to successful requests
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', reset.toString());
    return response;
  }
  
  return NextResponse.next();
}
```

### Caching Strategy

**File:** `src/hooks/useCache.js` (NEW)
```javascript
import { useState, useEffect, useCallback } from 'react';

// Simple in-memory cache with TTL
class Cache {
  constructor() {
    this.cache = new Map();
  }
  
  set(key, value, ttlMs = 5 * 60 * 1000) { // 5 minutes default
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlMs,
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  clear() {
    this.cache.clear();
  }
}

const cache = new Cache();

export function useCache(key, fetcher, ttlMs = 5 * 60 * 1000) {
  const [data, setData] = useState(() => cache.get(key));
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(null);
  
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const freshData = await fetcher();
      cache.set(key, freshData, ttlMs);
      setData(freshData);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);
  
  useEffect(() => {
    if (!data) {
      refetch();
    }
  }, [data, refetch]);
  
  return { data, loading, error, refetch };
}

// Cache invalidation helpers
export const cacheUtils = {
  invalidate: (key) => cache.delete(key),
  clear: () => cache.clear(),
  getStats: () => ({
    size: cache.cache.size,
    keys: Array.from(cache.cache.keys()),
  }),
};
```

---

## 6. SECURITY BEST PRACTICES

### Enhanced Security Headers

**File:** `vercel.json` (UPDATED)
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), payment=()"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co https://api.anthropic.com https://sentry.io https://*.sentry.io wss://*.supabase.co; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "credentialless"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Resource-Policy",
          "value": "same-origin"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ],
  "functions": {
    "api/generate.js": {
      "maxDuration": 30
    }
  }
}
```

### Input Validation & Sanitization

**File:** `src/utils/security.js` (NEW)
```javascript
import DOMPurify from 'dompurify';

// Content Security Policy violation reporting
export function initCSPReporting() {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.error('CSP Violation:', {
      violatedDirective: e.violatedDirective,
      blockedURI: e.blockedURI,
      sourceFile: e.sourceFile,
      lineNumber: e.lineNumber,
    });
    
    // Send to monitoring
    if (window.gtag) {
      window.gtag('event', 'csp_violation', {
        violated_directive: e.violatedDirective,
        blocked_uri: e.blockedURI,
      });
    }
  });
}

// Sanitize HTML content
export function sanitizeHTML(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a'],
    ALLOWED_ATTR: ['href', 'target'],
    ALLOW_DATA_ATTR: false,
  });
}

// Validate and sanitize user input
export function sanitizeInput(input, options = {}) {
  if (typeof input !== 'string') return '';
  
  let sanitized = input.trim();
  
  // Length limits
  if (options.maxLength) {
    sanitized = sanitized.substring(0, options.maxLength);
  }
  
  // Pattern validation
  if (options.pattern && !options.pattern.test(sanitized)) {
    throw new Error('Input does not match required pattern');
  }
  
  // HTML sanitization if needed
  if (options.allowHTML) {
    sanitized = sanitizeHTML(sanitized);
  } else {
    // Escape HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
  
  return sanitized;
}

// Rate limiting for client-side actions
export class ClientRateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
}

export const apiRateLimiter = new ClientRateLimiter(50, 60000); // 50 requests per minute
```

### Authentication Security

**File:** `src/utils/auth.js` (NEW)
```javascript
import * as Sentry from '@sentry/react';

// Secure session management
export class SecureSession {
  static setToken(token) {
    try {
      // Use httpOnly cookie in production, localStorage for demo
      if (import.meta.env.PROD) {
        document.cookie = `auth_token=${token}; path=/; secure; samesite=strict; max-age=86400`;
      } else {
        localStorage.setItem('auth_token', token);
      }
    } catch (error) {
      console.error('Failed to store auth token:', error);
      Sentry.captureException(error);
    }
  }
  
  static getToken() {
    try {
      if (import.meta.env.PROD) {
        const cookie = document.cookie
          .split('; ')
          .find(row => row.startsWith('auth_token='));
        return cookie ? cookie.split('=')[1] : null;
      } else {
        return localStorage.getItem('auth_token');
      }
    } catch (error) {
      console.error('Failed to retrieve auth token:', error);
      return null;
    }
  }
  
  static clearToken() {
    try {
      if (import.meta.env.PROD) {
        document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('Failed to clear auth token:', error);
    }
  }
}

// CSRF protection
export function generateCSRFToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateCSRFToken(token) {
  // In a real implementation, you'd store and validate against server state
  return token && token.length === 64;
}

// Secure password validation
export function validatePassword(password) {
  const minLength = 12;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

---

## PRODUCTION DEPLOYMENT CHECKLIST

### Pre-Deployment (Week 1)

#### 🔴 CRITICAL - Must Complete
- [ ] **Environment Security**
  - [ ] Remove admin credentials from client bundle
  - [ ] Implement environment validation
  - [ ] Set up secure secret management
  - [ ] Configure production environment variables

- [ ] **Security Hardening**
  - [ ] Implement CSP headers
  - [ ] Add rate limiting
  - [ ] Set up input validation and sanitization
  - [ ] Configure CORS policies

- [ ] **Error Handling**
  - [ ] Set up Sentry error tracking
  - [ ] Implement global error boundaries
  - [ ] Add API error classification
  - [ ] Configure error logging

#### 🟡 HIGH PRIORITY - Complete Before Launch
- [ ] **Monitoring & Observability**
  - [ ] Set up application monitoring
  - [ ] Configure performance tracking
  - [ ] Implement health checks
  - [ ] Set up alerting

- [ ] **Database Optimization**
  - [ ] Add performance indexes
  - [ ] Configure connection pooling
  - [ ] Set up database backups
  - [ ] Implement query optimization

- [ ] **CI/CD Pipeline**
  - [ ] Set up automated testing
  - [ ] Configure deployment pipeline
  - [ ] Implement security scanning
  - [ ] Set up staging environment

#### 🟢 MEDIUM PRIORITY - Complete Within 1 Month
- [ ] **Scalability**
  - [ ] Implement caching strategy
  - [ ] Set up load balancing
  - [ ] Configure auto-scaling
  - [ ] Optimize bundle size

- [ ] **Containerization**
  - [ ] Create Docker configuration
  - [ ] Set up container registry
  - [ ] Implement container security scanning
  - [ ] Configure orchestration

- [ ] **Compliance & Audit**
  - [ ] Implement audit logging
  - [ ] Set up compliance monitoring
  - [ ] Configure data retention policies
  - [ ] Implement GDPR compliance

### Deployment Steps

#### 1. Environment Setup
```bash
# Create production environment file
cp .env.example .env.production
# Edit with production values

# Validate environment
npm run validate-env

# Build for production
npm run build:production
```

#### 2. Security Configuration
```bash
# Run security audit
npm audit
npm run security-scan

# Validate CSP headers
npm run test:csp

# Test rate limiting
npm run test:rate-limiting
```

#### 3. Deployment
```bash
# Deploy to staging
npm run deploy:staging

# Run integration tests
npm run test:e2e:staging

# Deploy to production
npm run deploy:production
```

#### 4. Post-Deployment
```bash
# Monitor deployment
npm run monitor:deployment

# Run smoke tests
npm run test:smoke

# Enable monitoring alerts
npm run enable-alerts
```

### Rollback Plan
1. **Immediate Rollback**: Keep previous version deployed for 24 hours
2. **Gradual Rollback**: Route 10% traffic to new version, monitor metrics
3. **Feature Flags**: Use feature flags for risky changes
4. **Database Rollback**: Maintain migration rollback scripts

### Monitoring Metrics
- **Availability**: 99.9% uptime target
- **Performance**: < 2s page load, < 500ms API response
- **Errors**: < 1% error rate
- **Security**: Zero critical vulnerabilities

---

## REQUIRED CONFIGURATION CHANGES

### 1. Package.json Updates
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:production": "NODE_ENV=production vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext .js,.jsx",
    "lint:fix": "eslint src --ext .js,.jsx --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "validate-env": "node scripts/validate-env.js",
    "security-scan": "snyk test",
    "deploy:staging": "vercel --prod=false",
    "deploy:production": "vercel --prod=true",
    "monitor:deployment": "node scripts/monitor-deployment.js"
  },
  "dependencies": {
    "@sentry/react": "^7.0.0",
    "@sentry/tracing": "^7.0.0",
    "dompurify": "^3.0.0",
    "web-vitals": "^3.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^13.0.0",
    "@testing-library/jest-dom": "^5.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "snyk": "^1.0.0"
  }
}
```

### 2. Vercel Configuration Updates
```json
{
  "functions": {
    "api/generate.js": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "regions": ["iad1"],
  "buildCommand": "npm run build:production",
  "installCommand": "npm ci"
}
```

### 3. Environment Variables (Production)
```bash
# Required
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-prod-anon-key
ANTHROPIC_API_KEY=sk-ant-api03-your-prod-key

# Security
VITE_SENTRY_DSN=https://your-prod-sentry-dsn@sentry.io/project
VITE_ADMIN_USERNAME=your-admin-user
VITE_ADMIN_PASSWORD=your-secure-admin-pass

# Feature Flags
VITE_DEMO_ENABLED=false
VITE_APP_VERSION=1.0.0

# Monitoring
VERCEL_ANALYTICS_ID=your-analytics-id
```

---

## COST ESTIMATION

| Service | Monthly Cost | Notes |
|---------|-------------|--------|
| Vercel (Pro) | $20-100 | Hosting, functions, analytics |
| Supabase (Pro) | $25-100 | Database, auth, storage |
| Sentry (Team) | $29 | Error tracking |
| Anthropic API | $100-500 | AI content generation |
| **Total** | **$174-729** | Production infrastructure |

---

## CONCLUSION

Post-Pilot requires significant DevOps improvements before production deployment. The current setup lacks proper monitoring, security hardening, and scalability considerations.

**Priority Order:**
1. 🔴 **Security fixes** (environment, auth, headers)
2. 🟡 **Monitoring setup** (error tracking, logging)
3. 🟢 **CI/CD pipeline** (automation, testing)
4. 🔵 **Scalability** (caching, optimization)

**Estimated Timeline:** 4 weeks to production-ready
**Risk Level:** HIGH (multiple critical security issues)
**Recommended:** Complete all CRITICAL items before any user testing

---

**Next Steps:**
1. Review this report with development team
2. Prioritize CRITICAL security fixes
3. Set up monitoring infrastructure
4. Implement CI/CD pipeline
5. Plan production deployment

**Contact:** DevOps Team
**Date:** April 9, 2026
**Status:** ⛔ REQUIRES IMMEDIATE ATTENTION