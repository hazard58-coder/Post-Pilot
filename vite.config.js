import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateEnvironment } from './src/config/env.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (mode === 'production') {
    validateEnvironment(env);
  }

  return {
    plugins: [react()],
    define: {
      'window.__ENV__': {
        SUPABASE_URL:      JSON.stringify(env.VITE_SUPABASE_URL      || ''),
        SUPABASE_ANON_KEY: JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
        DEMO_ENABLED:      JSON.stringify(env.VITE_DEMO_ENABLED       ?? 'true'),
        OWNER_PASS:        JSON.stringify(env.VITE_OWNER_PASS         || ''),
      },
    },
  };
});
