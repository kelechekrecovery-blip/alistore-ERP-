import { expect, test } from '@playwright/test';
import { prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => {
  await resetDb();
});

test('owner receives consignment stock and reconciles a completed owner payout', async ({ page }) => {
  await resetDb();
  const session = await seedStaffCredentials('owner', 'e2e-consignment');
  await prisma.cashShift.create({
    data: {
      staffId: session.staffId,
      point: 'BISHKEK-1',
      openCash: 0,
      openIdempotencyKey: `e2e-consignment-shift-${Date.now()}`,
      openedAt: new Date(),
    },
  });
  const product = await prisma.product.create({
    data: {
      sku: `E2E-CONSIGN-${Date.now().toString(36)}`.toUpperCase(),
      name: 'E2E Used iPhone',
      price: 50_000,
      cost: 0,
      category: 'used',
      attrs: {},
    },
  });
  const quantityProduct = await prisma.product.create({
    data: {
      sku: `E2E-QCONS-${Date.now().toString(36)}`.toUpperCase(),
      name: 'E2E Consignment Cases',
      price: 1_500,
      cost: 0,
      category: 'accessories',
      trackingMode: 'quantity',
      attrs: {},
    },
  });

  await page.addInitScript((staff) => {
    localStorage.setItem('alistore.staff.auth.v1', JSON.stringify({
      accessToken: staff.accessToken,
      staffId: staff.staffId,
      username: staff.username,
      role: 'owner',
      totpEnabled: false,
    }));
  }, session);
  await page.goto('/warehouse', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Комиссионный товар' })).toBeVisible();

  await page.getByLabel('Комиссионный товар').selectOption(product.id);
  await page.getByLabel('IMEI комиссионного товара').fill('E2E-CONSIGN-RECEIVED');
  await page.getByLabel('Владелец комиссионного товара').fill('Клиент Б.');
  await page.getByLabel('Контакт владельца').fill('+996555000111');
  await page.getByLabel('Комиссия, процент').fill('10');
  await page.getByRole('button', { name: 'Принять на комиссию' }).click();
  await expect(page.getByRole('status')).toContainText('Комиссионный товар принят');
  await expect(page.getByText('E2E-CONSIGN-RECEIVED')).toBeVisible();

  await page.getByLabel('Тип комиссионного учёта').selectOption('quantity');
  await page.getByLabel('Комиссионный товар').selectOption(quantityProduct.id);
  await page.getByLabel('Количество в комиссионной партии').fill('12');
  await page.getByLabel('Владелец комиссионного товара').fill('Поставщик К.');
  await page.getByLabel('Контакт владельца').fill('+996555000333');
  await page.getByRole('button', { name: 'Принять на комиссию' }).click();
  await expect(page.getByRole('status')).toContainText('Комиссионная партия принята');
  await expect(page.locator('span.font-semibold', { hasText: 'E2E Consignment Cases' })).toBeVisible();
  await expect(page.getByText('12 свободно · 0 резерв')).toBeVisible();

  const customer = await prisma.customer.create({ data: { phone: '+996700900001', name: 'Buyer' } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'pos',
      fulfillmentType: 'store',
      pickupPoint: 'BISHKEK-1',
      status: 'completed',
      subtotal: 50_000,
      total: 50_000,
      items: { create: { sku: product.sku, qty: 1, price: 50_000, imei: 'E2E-CONSIGN-SOLD' } },
    },
  });
  const soldUnit = await prisma.deviceUnit.create({
    data: { imei: 'E2E-CONSIGN-SOLD', productId: product.id, status: 'sold', location: 'BISHKEK-1', orderId: order.id },
  });
  const sold = await prisma.consignmentItem.create({
    data: {
      idempotencyKey: 'e2e-consignment-sold',
      unitId: soldUnit.id,
      productId: product.id,
      ownerName: 'Клиент Б.',
      ownerContact: '+996555000111',
      commissionBps: 1000,
      status: 'sold',
      saleOrderId: order.id,
      salePrice: 50_000,
      commissionAmount: 5_000,
      ownerAmount: 45_000,
      soldAt: new Date(),
      createdBy: 'e2e',
    },
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('E2E-CONSIGN-SOLD')).toBeVisible();
  await page.locator('input[type="checkbox"]:not([disabled])').check();
  await page.getByRole('button', { name: /Выплата/ }).click();
  await expect(page.getByRole('status')).toContainText('создана');
  await expect.poll(async () => prisma.consignmentPayout.count()).toBe(1);

  await page.getByRole('button', { name: 'Провести' }).click();
  await expect(page.getByRole('status')).toContainText('проведена');
  await expect.poll(async () => prisma.consignmentItem.findUnique({ where: { id: sold.id } }))
    .toMatchObject({ status: 'settled' });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
