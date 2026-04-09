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