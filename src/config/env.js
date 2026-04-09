// Environment variable validation — runs in Node.js context (vite.config.js)
// Receives the env object from Vite's loadEnv so .env.local is included.
const ENV_SCHEMA = {
  VITE_SUPABASE_URL:      { required: true, pattern: /^https:\/\/.*\.supabase\.co$/ },
  VITE_SUPABASE_ANON_KEY: { required: true, pattern: /^eyJ/ },
  VITE_DEMO_ENABLED:      { required: false },
};

export function validateEnvironment(env = {}) {
  const errors = [];

  for (const [key, config] of Object.entries(ENV_SCHEMA)) {
    const value = env[key];

    if (config.required && !value) {
      errors.push(`Missing required environment variable: ${key}`);
    }

    if (value && config.pattern && !config.pattern.test(value)) {
      errors.push(`Invalid format for ${key}`);
    }
  }

  if (errors.length > 0) {
    // Warn instead of throw so the build succeeds without env vars.
    // The app handles missing config at runtime via Demo Mode.
    console.warn(`\n[PostPilot] Environment warnings:\n${errors.join('\n')}\n`);
  }
}
