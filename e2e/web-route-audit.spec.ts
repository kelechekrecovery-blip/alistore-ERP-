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
      // Прежняя проверка была истинна при любом исходе: регулярка
      // `/login|/erp|/pos|…` перечисляла и сам проверяемый маршрут, поэтому
      // тест проходил и когда редирект срабатывал, и когда оболочка
      // открывалась анонимному посетителю. Она не могла упасть — а значит
      // ничего и не защищала.
      //
      // Правильных исходов ровно два, и они разные по семейству маршрутов:
      // кабинет покупателя делает `router.replace('/login?next=…')`, а
      // служебные экраны остаются на месте и рисуют форму входа вместо данных.
      // Инвариант один: анонимному посетителю не показывают содержимое
      // защищённого экрана. Достигается он в этом приложении тремя способами —
      // кабинет местами делает `router.replace('/login?next=…')`, местами
      // остаётся на месте со ссылкой «Войдите по OTP», а служебные экраны
      // рисуют форму StaffSessionLogin вместо данных. Проверяем именно
      // инвариант, а не одну из реализаций: остались на маршруте — значит на
      // экране обязана быть форма входа или ссылка на неё.
      const pathname = new URL(page.url()).pathname;
      if (pathname !== '/login') {
        expect(pathname).toBe(route);
        // Ссылка обязана нести `?next=` — это адресная подсказка «войдите,
        // чтобы увидеть ЭТОТ экран». Просто `a[href^="/login"]` не годится:
        // такая ссылка есть в шапке сайта на каждой странице, и проверка снова
        // стала бы истинной всегда.
        await expect(
          page.locator('input[placeholder="username"], a[href^="/login?next="]').first(),
        ).toBeVisible();
      }
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
