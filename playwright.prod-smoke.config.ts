import { defineConfig, devices } from '@playwright/test';

// Read-only smoke config for LIVE prod (https://ali.kg). Isolated from the local
// e2e config on purpose: separate testDir (./e2e-prod), NO webServer, NO DB.
// Never point this at anything that mutates data — every spec here is read-only.
const baseURL = process.env.PROD_SMOKE_BASE_URL ?? 'https://ali.kg';
const browsers = (process.env.E2E_BROWSERS ?? 'chromium,webkit,firefox')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

export default defineConfig({
  testDir: './e2e-prod',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-prod' }],
    ['json', { outputFile: 'test-results-prod/results.json' }],
  ],
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'on',
    video: 'off',
  },
  projects: browsers.map((browser) => {
    if (browser === 'webkit') return { name: 'webkit', use: { ...devices['Desktop Safari'] } };
    if (browser === 'firefox') return { name: 'firefox', use: { ...devices['Desktop Firefox'] } };
    return { name: 'chromium', use: { ...devices['Desktop Chrome'] } };
  }),
});
