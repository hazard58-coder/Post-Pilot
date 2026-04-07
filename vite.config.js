import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'window.__ENV__': {
      SUPABASE_URL:      JSON.stringify(process.env.VITE_SUPABASE_URL      || ''),
      SUPABASE_ANON_KEY: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ''),
      ADMIN_USERNAME:    JSON.stringify(process.env.VITE_ADMIN_USERNAME     || ''),
      ADMIN_PASSWORD:    JSON.stringify(process.env.VITE_ADMIN_PASSWORD     || ''),
      // Set VITE_DEMO_ENABLED=false to hide demo/trial access in production.
      // Defaults to 'true' so local dev always has demo mode available.
      DEMO_ENABLED:      JSON.stringify(process.env.VITE_DEMO_ENABLED       ?? 'true'),
    },
  },
});
