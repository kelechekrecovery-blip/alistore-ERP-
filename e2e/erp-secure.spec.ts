import { expect, test } from '@playwright/test';
import { resetDb, seedStaffCredentials } from './helpers';

test('ERP loads protected reports and AI with a staff session', async ({ page, request }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('owner', 'e2e-erp');

  const protectedResponses: { url: string; status: number }[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/reports') || url.includes('/api/ai')) {
      protectedResponses.push({ url, status: response.status() });
    }
  });

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/erp');
  await expect(page.getByText('AliStore ERP · вход')).toBeVisible();
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByText('AliStore ERP').first()).toBeVisible();
  await expect(page.getByText('Дашборд').first()).toBeVisible();
  await expect(page.getByTestId('erp-shell')).toHaveCSS('width', '1280px');
  await expect(page.getByTestId('erp-shell')).toHaveCSS('height', '820px');
  await expect(page.getByTestId('erp-sidebar')).toHaveCSS('width', '230px');
  await expect(page.getByTestId('erp-main')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByText('Расширенные модули')).toBeVisible();

  await page.getByRole('button', { name: /Ассистент/ }).click();
  await expect(page.getByText('AI-ассистент').first()).toBeVisible();
  await page.getByRole('button', { name: /Цены/ }).click();
  await expect(page.getByText('Ценовые рекомендации').first()).toBeVisible();
  await page.getByRole('button', { name: /Готовность/ }).click();
  await expect(page.getByText('Готовность запуска').first()).toBeVisible();
  await expect(page.getByText('Production readiness').first()).toBeVisible();
  await expect(page.getByText(/strict gate:/).first()).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );

  expect(protectedResponses.filter((r) => r.status === 401 || r.status === 403)).toEqual([]);
});

test('ERP keeps Finance and Administration reachable through mobile navigation', async ({ page }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('owner', 'e2e-erp-mobile');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  const openNavigation = page.getByRole('button', { name: 'Открыть навигацию' });
  const main = page.getByTestId('erp-main');
  const sidebar = page.getByTestId('erp-sidebar');
  await expect(openNavigation).toBeVisible();
  await expect(main).toHaveCSS('width', '390px');
  await expect(sidebar).toHaveAttribute('inert', '');

  await openNavigation.click();
  await expect(page.getByTestId('erp-navigation-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Закрыть меню' })).toBeFocused();
  await sidebar.getByRole('button', { name: /Финансы/ }).click();
  await expect(page.getByRole('heading', { name: 'Учетный контроль' })).toBeVisible();
  await expect(page.getByTestId('erp-navigation-overlay')).toBeHidden();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.x ?? 0)
    .toBeLessThan(0);
  await expect(page.getByLabel('Период отчетов')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible();
  await expect(openNavigation).toBeFocused();
  expect(await main.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await main.evaluate((element) => element.clientWidth),
  );

  await openNavigation.click();
  await expect(page.getByRole('button', { name: 'Закрыть меню' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('erp-navigation-overlay')).toBeHidden();
  await expect(sidebar).toHaveAttribute('inert', '');
  await expect(openNavigation).toBeFocused();

  await openNavigation.click();
  await sidebar.getByRole('button', { name: /Администрирование/ }).click();
  await expect(page.getByRole('heading', { name: 'Администрирование AliStore' })).toBeVisible();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.x ?? 0)
    .toBeLessThan(0);
  await expect(page.getByRole('button', { name: /Админка сайта/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Согласования и 2FA/ })).toBeVisible();
  await expect(openNavigation).toBeFocused();
  expect(await main.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await main.evaluate((element) => element.clientWidth),
  );

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
