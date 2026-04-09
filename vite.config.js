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
