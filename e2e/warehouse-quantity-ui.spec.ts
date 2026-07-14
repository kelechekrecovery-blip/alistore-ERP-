import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => {
  await resetDb();
});

test('warehouse receives quantity stock and the ERP shows the authoritative balance', async ({ page }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('warehouse', 'e2e-quantity');
  const product = await prisma.product.create({
    data: {
      sku: `E2E-QTY-${Date.now().toString(36)}`.toUpperCase(),
      name: 'E2E USB-C Cable',
      price: 1800,
      cost: 800,
      category: 'accessories',
      trackingMode: 'quantity',
      attrs: {},
    },
  });

  await page.goto('/warehouse');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page.getByText('Склад · Сборка заказов')).toBeVisible();
  await page.locator('select').first().selectOption(product.id);
  await expect(page.locator('select').first()).toHaveValue(product.id);
  await page.getByPlaceholder('Количество, шт.').fill('12');
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await expect(page.getByText('✓ Принято 12 шт · BISHKEK-1')).toBeVisible();

  await expect.poll(async () => prisma.inventoryBalance.findUnique({
    where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
  })).toMatchObject({ onHand: 12, reserved: 0 });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Операции склада')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
