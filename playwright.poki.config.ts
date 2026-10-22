import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-poki',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 20_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm.cmd run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
