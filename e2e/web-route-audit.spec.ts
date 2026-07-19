import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

const anonymousRoutes = [
  '/',
  '/about',
  '/catalog',
  '/search',
  '/compare',
  '/favorites',
  '/cart',
  '/checkout',
  '/login',
  '/delivery',
  '/oferta',
  '/privacy',
  '/support',
  '/trade-in',
  '/exchange',
  '/warranty',
  '/assess',
  '/b2b',
  '/app',
  '/tg',
  '/product/__route_audit_missing__',
  '/order/__route_audit_missing__',
  '/account/orders/__route_audit_missing__',
  '/account/orders/__route_audit_missing__/status',
  '/account/warranty/__route_audit_missing__',
];

const authenticatedShellRoutes = [
  '/account',
  '/account/addresses',
  '/account/bonuses',
  '/account/devices',
  '/account/notifications',
  '/account/protection',
  '/account/returns',
  '/account/settings',
  '/admin/products',
  '/ai-tools',
  '/approvals',
  '/erp',
  '/pos',
  '/refunds',
  '/staff',
  '/warehouse',
];

const systemRoutes = [
  '/healthz',
  '/.well-known/apple-app-site-association',
  '/.well-known/assetlinks.json',
  '/robots.txt',
  '/sitemap.xml',
];

async function assertHealthyRoute(page: Page, route: string) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(route, { waitUntil: 'commit', timeout: 120_000 });
  expect(response, `${route} did not return a response`).not.toBeNull();
  expect(response!.status(), `${route} returned a server error`).toBeLessThan(500);

  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    bodyText: document.body.innerText.trim(),
  }));

  expect(layout.bodyText, `${route} rendered an empty document`).not.toBe('');
  expect(layout.width, `${route} has horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
  expect(httpErrors, `${route} had HTTP errors`).toEqual([]);
  expect(pageErrors, `${route} raised page errors`).toEqual([]);
  expect(consoleErrors, `${route} emitted console errors`).toEqual([]);
  expect(failedRequests, `${route} had failed network requests`).toEqual([]);
}

test.describe('Web route audit · anonymous', () => {
  for (const route of anonymousRoutes) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 402, height: 858 });
      await assertHealthyRoute(page, route);
    });
  }
});

test.describe('Web route audit · authenticated shell redirect safety', () => {
  for (const route of authenticatedShellRoutes) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await assertHealthyRoute(page, route);
      await expect(page).toHaveURL(/\/login|\/erp|\/pos|\/staff|\/warehouse|\/approvals|\/account|\/admin|\/ai-tools|\/refunds/);
    });
  }
});

test.describe('Web route audit · system endpoints', () => {
  for (const route of systemRoutes) {
    test(route, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'commit' });
      expect(response, `${route} did not return a response`).not.toBeNull();
      const status = response!.status();
      if (route.includes('/.well-known/') && [200, 503].includes(status)) return;
      expect(status, `${route} returned a server error`).toBeLessThan(500);
    });
  }
});
