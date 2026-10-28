import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Slice 1: static shell + mock replay only. No backend, no MediaPipe yet.
export default defineConfig({
  plugins: [react()],
});
