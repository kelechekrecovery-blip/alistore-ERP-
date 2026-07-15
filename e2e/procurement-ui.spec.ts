import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => {
  await resetDb();
});

test('owner creates, sends, and receives a purchase order in ERP', async ({ page, request }) => {
  await resetDb();
  const { username, password } = await seedStaffCredentials('owner', 'e2e-procurement');

  const supplier = await prisma.supplier.create({
    data: { name: `E2E Supplier ${Date.now().toString(36)}` },
  });
  const product = await prisma.product.create({
    data: {
      sku: `E2E-PO-${Date.now().toString(36)}`.toUpperCase(),
      name: 'E2E Procurement Phone',
      price: 100000,
      cost: 70000,
      category: 'phones',
      attrs: {},
    },
  });

  await page.goto('/erp');
  await page.getByPlaceholder('username').fill(username);
  await page.getByPlaceholder('password').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: /Закупки/ }).click();

  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
  await page.getByLabel('Поставщик PO').selectOption(supplier.id);
  await page.getByLabel('Товар PO 1').selectOption(product.id);
  await page.getByLabel('Количество PO 1').fill('1');
  await page.getByLabel('Закупочная цена PO 1').fill('70000');
  await page.getByRole('button', { name: 'Создать PO' }).click();
  await expect(page.getByText('Purchase Order создан')).toBeVisible();

  await page.getByTitle('Отправить PO').click();
  await expect(page.getByText(/отправлен$/)).toBeVisible();
  await page.getByLabel('IMEI для приёмки').fill('E2E-PO-IMEI-001');
  await page.getByRole('button', { name: 'Принять на склад' }).click();
  await expect(page.getByText('Принято устройств: 1')).toBeVisible();
  await expect(page.getByText('Принят', { exact: true })).toBeVisible();

  const order = await prisma.purchaseOrder.findFirstOrThrow({ include: { items: true } });
  expect(order.status).toBe('received');
  expect(order.items[0].receivedQty).toBe(1);
  await expect.poll(() => prisma.deviceUnit.count({ where: { imei: 'E2E-PO-IMEI-001' } })).toBe(1);
});

test('warehouse role can open procurement and receive a sent PO', async ({ page, request }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'e2e-owner');
  const warehouse = await seedStaffCredentials('warehouse', 'e2e-warehouse');

  const supplier = await prisma.supplier.create({ data: { name: `Warehouse Supplier ${Date.now().toString(36)}` } });
  const product = await prisma.product.create({
    data: { sku: `WH-PO-${Date.now().toString(36)}`.toUpperCase(), name: 'Warehouse Phone', price: 90000, cost: 60000, category: 'phones', attrs: {} },
  });
  const order = await postJson<{ id: string; items: { id: string }[] }>(request, '/procurement/purchase-orders', {
    idempotencyKey: `e2e-create-${Date.now().toString(36)}`,
    supplierId: supplier.id,
    location: 'BISHKEK-1',
    items: [{ productId: product.id, qty: 1, unitCost: 60000 }],
  }, owner.accessToken);
  await postJson(request, `/procurement/purchase-orders/${order.id}/send`, {}, owner.accessToken);

  await page.addInitScript((session) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify(session));
  }, {
    accessToken: warehouse.accessToken,
    staffId: warehouse.staffId,
    username: warehouse.username,
    role: 'warehouse',
    totpEnabled: false,
  });
  await page.goto('/erp');
  await page.getByRole('button', { name: /Закупки/ }).click();

  await expect(page.getByText('Рекомендации недоступны для этой роли.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
  await expect(page.getByText('Новый PO')).toHaveCount(0);
  await page.getByLabel('IMEI для приёмки').fill('E2E-WAREHOUSE-IMEI-001');
  await page.getByRole('button', { name: 'Принять на склад' }).click();
  await expect(page.getByText('Принято устройств: 1')).toBeVisible();

  await expect.poll(() => prisma.purchaseOrder.findUnique({ where: { id: order.id } }).then((row) => row?.status)).toBe('received');
});
