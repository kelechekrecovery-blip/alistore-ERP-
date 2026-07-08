import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 4200);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3200);
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://alistore@localhost:5432/alistore_test?schema=public';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: process.env.CI
        ? { ...devices['Desktop Chrome'] }
        : { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `DATABASE_URL="${databaseUrl}" AUTH_OTP_DEV_ECHO=true JWT_SECRET=dev-secret-alistore-local PORT=${apiPort} npm run start:dev -w @alistore/api`,
      url: `http://127.0.0.1:${apiPort}/api/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `NEXT_PUBLIC_API_BASE="http://127.0.0.1:${apiPort}/api" npm exec -w @alistore/web -- next dev -p ${webPort}`,
      url: `http://127.0.0.1:${webPort}/checkout`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
