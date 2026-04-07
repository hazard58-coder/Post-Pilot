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
    },
  },
});
