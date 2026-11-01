import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy for the coach endpoint: the client calls the relative path
// /api/coach so no key or provider URL lives in client code or config.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/coach': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
