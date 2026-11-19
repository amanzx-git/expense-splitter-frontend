import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

// Dev proxy: the browser talks only to localhost:5173.
// Vite forwards /api and /media to Django on localhost:8000,
// so cookies and CSRF behave as same-site traffic (R1.2-17).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: false },
      '/media': { target: 'http://localhost:8000', changeOrigin: false },
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'scripts/live.integration.test.jsx'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/tests/setup.js',
    testTimeout: 15000,
    // Tests must never depend on a developer's .env.local (for example mock mode).
    env: { VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: '' },
  },
});
