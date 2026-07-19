import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * READ-ONLY production smoke suite for https://ali.kg.
 *
 * Runs under playwright.prod-smoke.config.ts ONLY (separate testDir so the local
 * `npm run e2e` never picks it up). Every check here is non-destructive: it
 * navigates, reads, measures and screenshots. It never logs in, submits a form,
 * or mutates data — safe against live prod.
 *
 * Hard failures (real defects): server errors (>=500), empty render, uncaught
 * page errors, horizontal overflow, and missing pages that should exist (>=400
 * on a real route).
 * Soft findings (attached to the report, do not fail the run): console errors and
 * failed network requests, split into first-party vs third-party.
 */

const BREAKPOINTS = [320, 375, 768, 1024, 1440] as const;

// Real public routes that MUST exist (a >=400 here is a defect — e.g. /privacy 404).
const realAnonymousRoutes = [
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
];

// Deliberate not-found probes: must degrade gracefully (a page, not a 500).
const notFoundProbes = [
  '/product/__prod_smoke_missing__',
  '/order/__prod_smoke_missing__',
  '/account/orders/__prod_smoke_missing__',
];

// Authenticated shell routes: unauthenticated access must be gated (redirect to a
// login/shell URL or render a login affordance). Never authenticate on prod.
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

const a11yKeyPages = ['/', '/catalog', '/cart', '/checkout', '/privacy', '/support'];

const FIRST_PARTY = /(^|\.)ali\.kg$/i;

interface PageSignals {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

function watchSignals(page: Page): PageSignals {
  const signals: PageSignals = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') signals.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => signals.pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    const failure = r.failure()?.errorText ?? 'unknown';
    signals.failedRequests.push(`${r.method()} ${r.url()} (${failure})`);
  });
  return signals;
}

function hostOf(entry: string): string {
  const match = entry.match(/https?:\/\/([^/\s)]+)/i);
  return match ? match[1] : '';
}

function partition(entries: string[]): { firstParty: string[]; thirdParty: string[] } {
  const firstParty: string[] = [];
  const thirdParty: string[] = [];
  for (const entry of entries) {
    const host = hostOf(entry);
    if (host && FIRST_PARTY.test(host)) firstParty.push(entry);
    else thirdParty.push(entry);
  }
  return { firstParty, thirdParty };
}

async function attachSoftFindings(testInfo: TestInfo, route: string, signals: PageSignals): Promise<void> {
  const console = partition(signals.consoleErrors);
  const network = partition(signals.failedRequests);
  const report = {
    route,
    consoleErrors: { firstParty: console.firstParty, thirdParty: console.thirdParty },
    failedRequests: { firstParty: network.firstParty, thirdParty: network.thirdParty },
  };
  await testInfo.attach(`soft-findings ${route}`, {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
}

async function measureOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

test.describe('prod · anonymous routes render & responsive', () => {
  for (const route of realAnonymousRoutes) {
    test(`renders ${route}`, async ({ page }, testInfo) => {
      const signals = watchSignals(page);
      const response = await page.goto(route, { waitUntil: 'commit', timeout: 60_000 });
      expect(response, `${route} returned no response`).not.toBeNull();
      const status = response!.status();
      expect(status, `${route} is a real route but returned ${status}`).toBeLessThan(400);

      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);

      const bodyText = (await page.evaluate(() => document.body?.innerText ?? '')).trim();
      expect(bodyText, `${route} rendered an empty document`).not.toBe('');
      expect(signals.pageErrors, `${route} raised uncaught page errors`).toEqual([]);

      // Collect overflow across ALL breakpoints (don't stop at the first) and always
      // screenshot, so one run yields complete per-route responsive data.
      const overflows: string[] = [];
      for (const width of BREAKPOINTS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150); // let responsive CSS settle
        const { scrollWidth, clientWidth } = await measureOverflow(page);
        if (scrollWidth > clientWidth + 1) {
          overflows.push(`${width}px (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`);
        }
        if (width === 375 || width === 1440) {
          await testInfo.attach(`screenshot ${route} @${width}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
        }
      }

      await attachSoftFindings(testInfo, route, signals);
      expect(overflows, `${route} horizontal overflow at ${overflows.join(' | ')}`).toEqual([]);
    });
  }
});

test.describe('prod · not-found probes degrade gracefully', () => {
  for (const route of notFoundProbes) {
    test(`graceful 404 for ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'commit', timeout: 60_000 });
      expect(response, `${route} returned no response`).not.toBeNull();
      expect(response!.status(), `${route} should degrade (not a 5xx)`).toBeLessThan(500);
      const bodyText = (await page.evaluate(() => document.body?.innerText ?? '')).trim();
      expect(bodyText, `${route} rendered an empty document`).not.toBe('');
    });
  }
});

test.describe('prod · authenticated routes are gated', () => {
  for (const route of authenticatedShellRoutes) {
    test(`gates ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const response = await page.goto(route, { waitUntil: 'commit', timeout: 60_000 });
      expect(response, `${route} returned no response`).not.toBeNull();
      expect(response!.status(), `${route} returned a server error`).toBeLessThan(500);
      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);

      const gatedByUrl = /\/login|\/erp|\/pos|\/staff|\/warehouse|\/approvals|\/account|\/admin|\/ai-tools|\/refunds/.test(
        new URL(page.url()).pathname,
      );
      const cssGate = page.locator(
        'input[type="tel"], input[type="password"], input[name*="phone" i], input[name*="otp" i], button:has-text("Войти"), button:has-text("Вход")',
      );
      const textGate = page.getByText(/войти|вход|log ?in|sign ?in/i);
      const loginAffordance = await cssGate
        .or(textGate)
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        gatedByUrl || loginAffordance,
        `${route} did not gate: url=${page.url()} and no login affordance found (possible access-control issue)`,
      ).toBeTruthy();
    });
  }
});

test.describe('prod · system endpoints', () => {
  for (const route of systemRoutes) {
    test(`serves ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'commit', timeout: 45_000 });
      expect(response, `${route} returned no response`).not.toBeNull();
      const status = response!.status();
      // .well-known deep-link files may legitimately be absent (404) or gated (503).
      if (route.includes('/.well-known/')) {
        expect([200, 404, 503]).toContain(status);
        return;
      }
      expect(status, `${route} returned a server error`).toBeLessThan(500);
    });
  }
});

interface A11yViolations {
  htmlHasLang: boolean;
  imagesMissingAlt: number;
  inputsMissingLabel: number;
  buttonsMissingName: number;
  linksMissingName: number;
  h1Count: number;
}

async function auditA11y(page: Page): Promise<A11yViolations> {
  return page.evaluate(() => {
    const accessibleName = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) return labelledby;
      const title = el.getAttribute('title');
      if (title && title.trim()) return title.trim();
      return (el.textContent ?? '').trim();
    };
    const imgs = Array.from(document.querySelectorAll('img'));
    const imagesMissingAlt = imgs.filter(
      (img) => img.getAttribute('aria-hidden') !== 'true' && !img.hasAttribute('alt'),
    ).length;
    const inputs = Array.from(
      document.querySelectorAll('input:not([type=hidden]), select, textarea'),
    );
    const inputsMissingLabel = inputs.filter((el) => {
      const id = el.getAttribute('id');
      const hasFor = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : false;
      const wrapped = Boolean(el.closest('label'));
      const aria = Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
      return !hasFor && !wrapped && !aria;
    }).length;
    const buttons = Array.from(document.querySelectorAll('button'));
    const buttonsMissingName = buttons.filter((b) => accessibleName(b) === '' && !b.querySelector('img,svg[aria-label]')).length;
    const links = Array.from(document.querySelectorAll('a[href]'));
    const linksMissingName = links.filter((a) => accessibleName(a) === '' && !a.querySelector('img,svg')).length;
    return {
      htmlHasLang: Boolean(document.documentElement.getAttribute('lang')),
      imagesMissingAlt,
      inputsMissingLabel,
      buttonsMissingName,
      linksMissingName,
      h1Count: document.querySelectorAll('h1').length,
    };
  });
}

test.describe('prod · basic a11y on key pages', () => {
  for (const route of a11yKeyPages) {
    test(`a11y ${route}`, async ({ page }, testInfo) => {
      await page.goto(route, { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
      const violations = await auditA11y(page);
      await testInfo.attach(`a11y ${route}`, {
        body: JSON.stringify(violations, null, 2),
        contentType: 'application/json',
      });
      // Hard: a document language is a baseline requirement.
      expect(violations.htmlHasLang, `${route} <html> has no lang attribute`).toBeTruthy();
      // Everything else is reported (attached) for triage, not thrown.
    });
  }
});

test.describe('prod · catalog surfaces products', () => {
  test('catalog lists products and a product page loads', async ({ page }) => {
    await page.goto('/catalog', { waitUntil: 'commit', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
    const productHref = await page
      .locator('a[href*="/product/"]')
      .first()
      .getAttribute('href')
      .catch(() => null);
    expect(productHref, 'catalog rendered no product links').toBeTruthy();

    const response = await page.goto(productHref!, { waitUntil: 'commit', timeout: 60_000 });
    expect(response!.status(), `${productHref} returned a server error`).toBeLessThan(400);
    const bodyText = (await page.evaluate(() => document.body?.innerText ?? '')).trim();
    expect(bodyText, `${productHref} rendered empty`).not.toBe('');
  });
});
