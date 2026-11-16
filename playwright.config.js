import { defineConfig, devices } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.PORT ?? 4173}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  use: {
    baseURL,
    locale: 'en-GB',
    timezoneId: 'Europe/Helsinki',
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: 'node tests/server.js',
    env: { PHASE_TEST_UPDATES: '1' },
    url: baseURL,
    reuseExistingServer: false
  }
});
