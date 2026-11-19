import { defineConfig, configDefaults } from 'vitest/config';
import base from '../vite.config.js';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/live.integration.test.jsx'],
    exclude: configDefaults.exclude,
    testTimeout: 30000,
    environmentOptions: { jsdom: { url: 'http://localhost:5173' } },
    env: { ...base.test.env, VITE_API_BASE_URL: process.env.LIVE_DJANGO_ORIGIN },
  },
});
