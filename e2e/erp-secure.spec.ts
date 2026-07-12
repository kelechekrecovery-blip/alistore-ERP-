import { expect, test } from '@playwright/test';
import { postJson, resetDb } from './helpers';

test('ERP loads protected reports and AI with a staff session', async ({ page, request }) => {
  await resetDb();
  const username = `e2e-erp-${Date.now().toString(36)}`;
  const password = 'pass-e2e';
  await postJson(request, '/staff-auth/bootstrap', { username, password });

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
