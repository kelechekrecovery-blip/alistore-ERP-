import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

test('ERP store-point lifecycle controls storefront pickup options', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('PHASE1-PICKUP');
  const { username, password } = await seedStaffCredentials('owner', 'e2e-phase1-logistics');
  const code = `phase1-${Date.now().toString(36)}`;
  const name = 'AliStore Phase 1 Pickup';

  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Логистика' }).click();
  await page.getByRole('tab', { name: 'Точки выдачи' }).click();

  await page.getByLabel('Код точки').fill(code);
  await page.getByLabel('Название точки').fill(name);
  await page.getByLabel('Адрес точки').fill('Бишкек, тестовый адрес Фазы 1');
  await page.getByLabel('Код склада точки').fill('PHASE1-LOC');
  await page.getByLabel('Часы точки').fill('Ежедневно 09:00–22:00');
  await page.getByRole('button', { name: 'Добавить' }).click();

  const point = page.getByTestId(/store-point-/).filter({ hasText: name });
  await expect(point).toBeVisible();
  const created = await prisma.storePoint.findFirstOrThrow({ where: { code } });
  expect(created).toMatchObject({ name, active: true, inventoryLocation: 'PHASE1-LOC' });

  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByText('Бишкек, тестовый адрес Фазы 1')).toBeVisible();

  await page.goto('/erp');
  await page.getByRole('button', { name: 'Логистика' }).click();
  await page.getByRole('tab', { name: 'Точки выдачи' }).click();
  const activePoint = page.getByTestId(`store-point-${created.id}`);
  await activePoint.getByRole('button', { name: 'Активна' }).click();
  await expect(activePoint.getByRole('button', { name: 'Отключена' })).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
  await expect(page.getByText('Бишкек, тестовый адрес Фазы 1')).toHaveCount(0);
});

test('ERP delivery zone and slot control courier checkout availability', async ({ page }) => {
  await resetDb();
  const { product } = await seedProduct('PHASE1-DELIVERY');
  const { username, password } = await seedStaffCredentials('owner', 'e2e-phase1-delivery');
  const suffix = Date.now().toString(36);
  const zoneCode = `phase1-zone-${suffix}`;

  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Логистика' }).click();
  await page.getByRole('tab', { name: 'Зоны и слоты' }).click();
  await page.getByLabel('Код зоны').fill(zoneCode);
  await page.getByLabel('Название зоны').fill('Фаза 1 · Центр');
  await page.getByLabel('Тариф зоны').fill('350');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('strong').filter({ hasText: 'Фаза 1 · Центр' })).toBeVisible();
  await page.getByLabel('Начало слота').fill('10:00');
  await page.getByLabel('Конец слота').fill('12:00');
  await page.getByLabel('Ёмкость слота').fill('1');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('0/1')).toBeVisible();
  const zone = await prisma.deliveryZone.findUniqueOrThrow({ where: { code: zoneCode } });

  await page.goto('/checkout');
  await page.getByRole('button', { name: /Курьер/ }).click();
  await expect(page.getByLabel('Зона доставки')).toContainText('Фаза 1 · Центр');
  await expect(page.getByLabel('Зона доставки')).toHaveValue(zone.id);
  await expect(page.getByRole('button', { name: /осталось 1/ })).toBeEnabled();
  await expect(page.getByLabel('Зона доставки')).toHaveText(/350 с/);
});
