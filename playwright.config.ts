import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.E2E_API_PORT ?? 4200);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3200);
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://alistore@localhost:5432/alistore_test?schema=public';
const mediaLocalDir = `/tmp/alistore-e2e-media-${apiPort}`;
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER
  ? process.env.E2E_REUSE_EXISTING_SERVER === 'true'
  : !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
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
      command: `DATABASE_URL="${databaseUrl}" MEDIA_LOCAL_DIR="${mediaLocalDir}" E2E_TEST=true NODE_ENV=test AI_PROVIDER=rules AI_PROVIDER_KEY= OPENROUTER_API_KEY= ANTHROPIC_API_KEY= AUTH_OTP_DEV_ECHO=true JWT_SECRET=dev-secret-alistore-local PORT=${apiPort} npm run start:dev -w @alistore/api`,
      url: `http://127.0.0.1:${apiPort}/api/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_API_BASE="http://127.0.0.1:${apiPort}/api" npm exec -w @alistore/web -- next dev -p ${webPort}`,
      url: `http://127.0.0.1:${webPort}/checkout`,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
