#!/usr/bin/env node

// Environment validation script
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

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

  // Optional monitoring
  VITE_SENTRY_DSN: { required: false, pattern: /^https:\/\/.*@sentry\.io/ },
  VITE_APP_VERSION: { required: false, default: '1.0.0' },
};

function validateEnvironment() {
  const errors = [];
  const warnings = [];

  console.log('🔍 Validating environment variables...\n');

  for (const [key, config] of Object.entries(ENV_SCHEMA)) {
    const value = process.env[key];

    if (config.required && !value) {
      errors.push(`❌ Missing required environment variable: ${key}`);
    } else if (value && config.pattern && !config.pattern.test(value)) {
      errors.push(`❌ Invalid format for ${key}`);
    } else if (value) {
      console.log(`✅ ${key}: ${config.serverOnly ? '[REDACTED]' : 'configured'}`);
    } else if (config.default) {
      console.log(`⚠️  ${key}: using default value '${config.default}'`);
    }

    // Security warnings
    if (key.includes('PASSWORD') && value && value.length < 12) {
      warnings.push(`⚠️  ${key} is shorter than recommended (12+ characters)`);
    }

    if (key === 'VITE_ADMIN_USERNAME' && value && value === 'admin') {
      warnings.push(`⚠️  Using default admin username - change in production`);
    }
  }

  // Additional security checks
  if (process.env.NODE_ENV === 'production') {
    if (process.env.VITE_DEMO_ENABLED !== 'false') {
      warnings.push('⚠️  Demo mode enabled in production');
    }
  }

  console.log('\n' + '='.repeat(50));

  if (errors.length > 0) {
    console.log('\n❌ VALIDATION FAILED');
    errors.forEach(error => console.log(`   ${error}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS');
    warnings.forEach(warning => console.log(`   ${warning}`));
  }

  console.log('\n✅ Environment validation passed!');
  console.log(`   Ready for ${process.env.NODE_ENV || 'development'} deployment`);
}

if (require.main === module) {
  validateEnvironment();
}

module.exports = { validateEnvironment, ENV_SCHEMA };