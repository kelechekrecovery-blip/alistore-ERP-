import { expect, test } from '@playwright/test';
import { API_BASE, prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

test.afterEach(async () => resetDb());

test('ERP point availability immediately controls public checkout options', async ({ page, request }) => {
  await resetDb();
  const { product } = await seedProduct('POINT-AVAILABILITY', 1_000);
  const owner = await seedStaffCredentials('owner', 'e2e-store-point-owner');
  await page.addInitScript(() => {
    localStorage.removeItem('alistore.cart.pricing.v1');
  });
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(owner.username);
  await page.getByPlaceholder('password').fill(owner.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /Логистика/ }).click();
  await page.getByRole('tab', { name: 'Точки выдачи' }).click();

  const point = page.getByTestId('store-point-alistore-bishkek-1');
  await expect(point).toBeVisible();
  await point.getByRole('button', { name: 'Активна' }).click();
  await expect(point.getByRole('button', { name: 'Отключена' })).toBeVisible();

  let response = await request.get(`${API_BASE}/logistics/checkout-options`);
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).pickupPoints).toEqual([]);

  await page.goto('/checkout');
  await expect(page.getByText('Сейчас нет доступных точек самовывоза.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Далее' }).last()).toBeDisabled();

  await page.goto('/erp');
  await page.getByRole('button', { name: /Логистика/ }).click();
  await page.getByRole('tab', { name: 'Точки выдачи' }).click();
  const disabledPoint = page.getByTestId('store-point-alistore-bishkek-1');
  await disabledPoint.getByRole('button', { name: 'Отключена' }).click();
  await expect(disabledPoint.getByRole('button', { name: 'Активна' })).toBeVisible();
  response = await request.get(`${API_BASE}/logistics/checkout-options`);
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).pickupPoints).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'alistore-bishkek-1', inventoryLocation: 'BISHKEK-1' })]),
  );

  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: /^AliStore Центр Бишкек,/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Далее' }).last()).toBeEnabled();
});

test('owner creates delivery capacity and dispatches a packed order', async ({ page }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-logistics-owner');
  const courier = await seedStaffCredentials('courier', 'e2e-logistics-courier');
  const date = new Date().toISOString().slice(0, 10);
  const suffix = Date.now().toString(36);

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(owner.username);
  await page.getByPlaceholder('password').fill(owner.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /Логистика/ }).click();
  await expect(page.getByTestId('logistics-view')).toBeVisible();
  await page.getByLabel('Дата логистики').fill(date);
  await page.getByLabel('Код зоны').fill(`center-${suffix}`);
  await page.getByLabel('Название зоны').fill('Центр');
  await page.getByLabel('Тариф зоны').fill('300');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByRole('strong').filter({ hasText: 'Центр' })).toBeVisible();
  await page.getByLabel('Начало слота').fill('10:00');
  await page.getByLabel('Конец слота').fill('12:00');
  await page.getByLabel('Ёмкость слота').fill('2');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('0/2')).toBeVisible();

  const zone = await prisma.deliveryZone.findUniqueOrThrow({ where: { code: `center-${suffix}` } });
  const slot = await prisma.deliverySlot.findFirstOrThrow({ where: { zoneId: zone.id } });
  const customer = await prisma.customer.create({ data: { phone: `+996700${Date.now().toString().slice(-6)}`, name: 'Айжан' } });
  const order = await prisma.order.create({ data: {
    customerId: customer.id, channel: 'web', fulfillmentType: 'courier', status: 'packed', subtotal: 100000,
    paymentMode: 'cod',
    deliveryFee: zone.fee, total: 100300, deliveryAddress: 'ул. Киевская 95', deliverySlot: '10:00–12:00',
    deliveryZoneId: zone.id, deliverySlotId: slot.id, items: { create: { sku: `UI-LOG-${suffix}`, qty: 1, price: 100000 } },
  } });

  await page.getByRole('button', { name: /Финансы/ }).click();
  await page.getByRole('button', { name: /Логистика/ }).click();
  await page.getByRole('tab', { name: 'Маршруты' }).click();
  await expect(page.getByText('Айжан')).toBeVisible();
  await page.locator('section').filter({ hasText: 'Диспетчеризация' }).getByRole('checkbox').check();
  await page.getByLabel('Курьер рейса').selectOption(courier.staffId);
  await page.getByRole('button', { name: /Создать рейс · 1/ }).click();
  await expect(page.getByText('ул. Киевская 95')).toBeVisible();
  await expect.poll(async () => (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('courier_assigned');
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).courierId).toBe(courier.staffId);
  expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'logistics.' } } })).toBe(2);
});
