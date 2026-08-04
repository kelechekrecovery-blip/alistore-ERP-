import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => {
  await resetDb();
});

test('warehouse receives quantity stock and the ERP shows the authoritative balance', async ({ page }) => {
  await resetDb();
  const session = await seedStaffCredentials('warehouse', 'e2e-quantity');
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
  await prisma.storePoint.create({
    data: {
      id: `e2e-quantity-destination-${Date.now().toString(36)}`,
      code: `e2e-quantity-${Date.now().toString(36)}`,
      name: 'AliStore Второй склад',
      address: 'Бишкек, тестовый склад',
      inventoryLocation: 'BISHKEK-2',
      hours: 'Ежедневно 10:00–21:00',
      active: true,
      sortOrder: 1,
      createdBy: 'e2e',
      idempotencyKey: `e2e-quantity-destination-${Date.now()}`,
    },
  });

  await page.addInitScript((auth) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(auth));
  }, { accessToken: session.accessToken, staffId: session.staffId, username: session.username, role: 'warehouse', totpEnabled: false });
  await page.goto('/warehouse');

  await expect(page.getByText('Склад · Сборка заказов')).toBeVisible();
  await page.locator('select').first().selectOption(product.id);
  await expect(page.locator('select').first()).toHaveValue(product.id);
  await expect(page.getByLabel('Склад приёмки')).toHaveValue('BISHKEK-1');
  await page.getByPlaceholder('Количество, шт.').fill('12');
  const receiveResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/inventory/receive-quantity') &&
    response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  const receiveResponse = await receiveResponsePromise;
  expect(receiveResponse.ok(), await receiveResponse.text()).toBeTruthy();
  await expect(page.getByText('✓ Принято 12 шт · BISHKEK-1')).toBeVisible();

  await expect.poll(async () => prisma.inventoryBalance.findUnique({
    where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
  })).toMatchObject({ onHand: 12, reserved: 0 });

  await page.getByLabel('Товар для перемещения').selectOption(product.id);
  await page.getByLabel('Количество для перемещения').fill('5');
  await page.getByLabel('Склад назначения').selectOption('BISHKEK-2');
  await page.getByRole('button', { name: 'Переместить', exact: true }).click();
  await expect(page.getByText('✓ 5 шт: BISHKEK-1 → BISHKEK-2 · фото 0')).toBeVisible();
  await expect.poll(async () => Promise.all([
    prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    }),
    prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-2' } },
    }),
  ])).toEqual([
    expect.objectContaining({ onHand: 7, reserved: 0 }),
    expect.objectContaining({ onHand: 5, reserved: 0 }),
  ]);

  await page.getByLabel('Товар для корректировки').selectOption(product.id);
  await page.getByLabel('Количество корректировки').fill('2');
  await page.getByLabel('Причина корректировки').fill('Повреждение упаковки');
  await page.getByRole('button', { name: 'На согласование' }).click();
  await expect(page.getByText(/Заявка .* отправлена владельцу/)).toBeVisible();
  await expect.poll(async () => prisma.approval.findFirst({ where: { action: 'write_off' } }))
    .toMatchObject({ status: 'requested' });
  expect(await prisma.inventoryBalance.findUnique({
    where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
  })).toMatchObject({ onHand: 7 });

  await page.getByLabel('Товар инвентаризации').selectOption(product.id);
  await page.getByLabel('Фактическое количество').fill('7');
  const countRequestPromise = page.waitForRequest((request) =>
    request.url().endsWith('/api/inventory/count') &&
    request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  const countRequest = await countRequestPromise;
  expect(countRequest.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page.getByText('✓ Учтено 7, было 7, расхождение 0 · сканов 0 · фото 0')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Операции склада')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
