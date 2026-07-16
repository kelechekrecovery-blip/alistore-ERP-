import { expect, test } from '@playwright/test';
import { bootstrapStaff, postJson, prisma, resetDb } from './helpers';

test('staff exchanges a sold IMEI into a higher-priced replacement', async ({ request }) => {
  await resetDb();
  const staffToken = await bootstrapStaff(request);
  const staff = await prisma.staffUser.findFirstOrThrow({ where: { username: { startsWith: 'e2e-owner-' } } });
  const shift = await prisma.cashShift.create({
    data: { staffId: staff.id, point: 'BISHKEK-1', openCash: 50_000 },
  });
  const customer = await prisma.customer.create({ data: { phone: '+996700900003', name: 'Exchange' } });
  const oldProduct = await prisma.product.create({
    data: { sku: 'E2E-OLD', name: 'Old Phone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
  });
  const newProduct = await prisma.product.create({
    data: { sku: 'E2E-NEW', name: 'New Phone', price: 120000, cost: 90000, category: 'phones', attrs: {} },
  });
  const original = await prisma.order.create({
    data: {
      customerId: customer.id,
      channel: 'pos',
      status: 'paid',
      total: 100000,
      items: { create: [{ sku: oldProduct.sku, qty: 1, price: 100000, imei: 'E2E-OLD-IMEI' }] },
    },
  });
  await prisma.deviceUnit.create({
    data: { imei: 'E2E-OLD-IMEI', productId: oldProduct.id, status: 'sold', orderId: original.id, location: 'BISHKEK-1' },
  });
  await prisma.deviceUnit.create({
    data: { imei: 'E2E-NEW-IMEI', productId: newProduct.id, status: 'in_stock', location: 'BISHKEK-1' },
  });

  const result = await postJson<{ surcharge: number; exchangeOrderId: string }>(
    request,
    '/exchanges',
    { originalOrderId: original.id, oldImei: 'E2E-OLD-IMEI', newProductId: newProduct.id, method: 'cash', shiftId: shift.id },
    staffToken,
    { 'idempotency-key': 'e2e-exchange-1' },
  );

  expect(result.surcharge).toBe(20000);
  expect((await prisma.deviceUnit.findUnique({ where: { imei: 'E2E-OLD-IMEI' } }))?.status).toBe('returned');
  expect((await prisma.deviceUnit.findUnique({ where: { imei: 'E2E-NEW-IMEI' } }))?.status).toBe('sold');
  expect((await prisma.order.findUnique({ where: { id: result.exchangeOrderId } }))?.status).toBe('paid');
});
