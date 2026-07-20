import { expect, test, type Page } from '@playwright/test';
import { resetDb, seedStaffCredentials } from './helpers';

/**
 * A failed request must never look like data.
 *
 * Every ERP mock this repo grew answered a failure with plausible figures —
 * invented couriers, a 273 200 сом payroll run, six employees who do not exist.
 * Two screens even showed an error banner while still rendering the numbers
 * underneath it, which reads as a warning about something unrelated.
 *
 * One parametrised spec covers every screen instead of eight separate ones: it
 * stubs the screen's own endpoint with a 500 and asserts the screen says so
 * rather than inventing a substitute. `scripts/check-no-fixtures.mjs` guards the
 * same rule statically; this guards it at runtime, where a fixture can also
 * arrive from a default prop or a memo.
 */

/** Money-shaped text — the tell-tale of a fixture rendered as real data. */
const MONEY = /\d[\d\s ]{2,}\s?(сом|c\b|₽)/;

interface Screen {
  nav: RegExp;
  /** The endpoint this screen depends on; stubbed with a 500. */
  route: string;
  /** Screens already cleaned — these must pass today. */
  cleaned: boolean;
}

const SCREENS: Screen[] = [
  { nav: /Дашборд/, route: '**/api/reports/dashboard*', cleaned: true },
  { nav: /KPI и ЗП/, route: '**/api/reports/kpi*', cleaned: true },
  { nav: /Логистика/, route: '**/api/logistics/overview*', cleaned: true },
  { nav: /HR · Смены/, route: '**/api/hr/week*', cleaned: true },
  { nav: /Операции точки/, route: '**/api/store-operations/overview*', cleaned: true },
  { nav: /AI-ассистент/, route: '**/api/ai/insights*', cleaned: true },
  { nav: /CRM/, route: '**/api/campaigns/preview*', cleaned: true },
  { nav: /Задачи/, route: '**/api/staff-tasks?*', cleaned: true },
  { nav: /Сервис-центр/, route: '**/api/service-center/**', cleaned: false },
  { nav: /Склад/, route: '**/api/catalog/products*', cleaned: false },
];

async function signIn(page: Page): Promise<void> {
  const { username, password } = await seedStaffCredentials('owner', 'e2e-no-fixtures');
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('AliStore ERP').first()).toBeVisible();
}

for (const screen of SCREENS) {
  const title = `«${screen.nav.source}» показывает ошибку, а не выдуманные данные`;
  const run = screen.cleaned ? test : test.fixme;

  run(title, async ({ page }) => {
    await resetDb();
    await signIn(page);

    await page.route(screen.route, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"сервер недоступен"}' }),
    );

    await page.getByTestId('erp-sidebar').getByRole('button', { name: screen.nav }).click();
    // Generous: this asserts *what* the screen shows, not how fast. On a shared
    // stand a cold route compile alone can eat ten seconds.
    await expect
      .poll(async () => /Не удалось|не загрузились|Ошибка/.test(await page.locator('main').innerText()), {
        timeout: 25_000,
      })
      .toBe(true);

    const main = page.locator('main');
    await expect(main.getByRole('button', { name: /Повторить/ }).first()).toBeVisible();

    // The screen may legitimately show zeros or dashes; it must not show sums,
    // because with a dead endpoint there is nothing to compute a sum from.
    const body = await main.innerText();
    expect(body.match(MONEY)?.[0] ?? null).toBeNull();
  });
}
