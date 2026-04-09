# Environment variable validation and security
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