import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
