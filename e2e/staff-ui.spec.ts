import { expect, test } from '@playwright/test';
import { postJson, resetDb } from './helpers';

test('Staff app follows the canonical four-section mobile shell', async ({ page, request }) => {
  await resetDb();
  const username = `e2e-staff-ui-${Date.now().toString(36)}`;
  const password = 'pass-e2e';
  await postJson(request, '/staff-auth/bootstrap', { username, password });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/staff');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  const app = page.getByTestId('staff-app');
  await expect(app).toBeVisible();
  await expect(app).toHaveCSS('width', '402px');
  await expect(app).toHaveCSS('background-color', 'rgb(22, 19, 15)');
  await expect(page.getByText('Сотрудник', { exact: true })).toBeVisible();
  await expect(page.getByTestId('staff-primary-actions').locator('a, button')).toHaveCount(4);
  await expect(page.locator('main > div:last-child button')).toHaveCount(4);

  await page.getByRole('button', { name: 'Задачи и KPI' }).click();
  await expect(page.getByRole('heading', { name: 'Задачи и KPI' })).toBeVisible();
  await page.getByRole('button', { name: 'Назад на главную' }).click();
  await expect(page.getByText('ЗАДАЧА ОТ AI')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
