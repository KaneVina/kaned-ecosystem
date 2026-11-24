import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Puts the developer-tools guard (disable-devtool + src/guard/head-guard.js) inline at the very top of
 * <head>, so it runs before anything else on the page.
 */
function headGuard(mode: string): Plugin {
  const require = createRequire(import.meta.url);
  const setting = loadEnv(mode, process.cwd(), 'VITE_').VITE_DEVTOOLS_GUARD ?? process.env.VITE_DEVTOOLS_GUARD ?? 'on';
  return {
    name: 'kaned-head-guard',
    transformIndexHtml() {
      const lib = readFileSync(require.resolve('disable-devtool'), 'utf8');
      const guard = readFileSync(fileURLToPath(new URL('./src/guard/head-guard.js', import.meta.url)), 'utf8').replace('__GUARD_SETTING__', setting === 'off' ? 'off' : 'on');
      return [{ tag: 'script', children: `${lib}\n${guard}`, injectTo: 'head' }];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), headGuard(mode)],
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
}));
