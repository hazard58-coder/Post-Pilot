import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      'window.__ENV__': {
        SUPABASE_URL:      JSON.stringify(env.VITE_SUPABASE_URL      || ''),
        SUPABASE_ANON_KEY: JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
        ADMIN_USERNAME:    JSON.stringify(env.VITE_ADMIN_USERNAME     || ''),
        ADMIN_PASSWORD:    JSON.stringify(env.VITE_ADMIN_PASSWORD     || ''),
        // Set VITE_DEMO_ENABLED=false to hide demo/trial access in production.
        // Defaults to 'true' so local dev always has demo mode available.
        DEMO_ENABLED:      JSON.stringify(env.VITE_DEMO_ENABLED       ?? 'true'),
      },
    },
  };
});
