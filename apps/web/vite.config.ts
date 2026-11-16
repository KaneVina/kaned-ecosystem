import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Point at the source so editing the shared package is instant in dev
      // and Vercel never builds against a stale dist.
      '@kaned/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Fail loudly instead of drifting to 5174, 5175... (`npm run dev` frees
    // ports held by an old Kaned dev server first; see scripts/free-ports.mjs).
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'axios'],
        },
      },
    },
  },
});
