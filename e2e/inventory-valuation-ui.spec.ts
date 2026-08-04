import { expect, test } from '@playwright/test';
import { API_BASE, resetDb, seedStaffCredentials } from './helpers';

test('owner sees owned inventory valuation and GL reconciliation in ERP stock', async ({ page, request }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-inventory-valuation');
  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: owner.accessToken,
    staffId: owner.staffId,
    username: owner.username,
    role: 'owner',
    totpEnabled: false,
  });

  const reconciliationResponse = page.waitForResponse((response) =>
    response.url().includes('/api/inventory/valuation/reconciliation'));
  const rollForwardResponse = page.waitForResponse((response) =>
    response.url().includes('/api/inventory/valuation/roll-forward'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/erp');
  await page.getByRole('button', { name: /Склад/ }).click();

  expect((await reconciliationResponse).status()).toBe(200);
  expect((await rollForwardResponse).status()).toBe(200);
  await expect(page.getByText('Движение стоимости запасов')).toBeVisible();
  await expect(page.getByText('Начало + поступления + возвраты')).toBeVisible();
  await expect(page.getByText('Оценка запасов и GL 1200')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Количественный' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Серийный' })).toBeVisible();
  await expect(page.getByText('GL 1200', { exact: true })).toBeVisible();
  await expect(page.getByText('GL на начало', { exact: true })).toBeVisible();
  await expect(page.getByText('Разница начала', { exact: true })).toBeVisible();
  await expect(page.getByText('GL на конец', { exact: true })).toBeVisible();
  await expect(page.getByText('Разница конца', { exact: true })).toBeVisible();
  await expect(page.getByText('Период сходится', { exact: true })).toBeVisible();
  await expect(page.getByText('Количественных остатков нет')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );

  const warehouse = await seedStaffCredentials('warehouse', 'e2e-inventory-valuation-denied');
  const forbidden = await request.get(`${API_BASE}/inventory/valuation/reconciliation`, {
    headers: { authorization: `Bearer ${warehouse.accessToken}` },
  });
  expect(forbidden.status()).toBe(403);
  const forbiddenRollForward = await request.get(`${API_BASE}/inventory/valuation/roll-forward`, {
    params: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    headers: { authorization: `Bearer ${warehouse.accessToken}` },
  });
  expect(forbiddenRollForward.status()).toBe(403);
});
