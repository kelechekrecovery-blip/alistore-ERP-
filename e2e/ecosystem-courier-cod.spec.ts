import { expect, test } from '@playwright/test';
import { API_BASE, postJson, prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

const PRODUCT_PRICE = 100_000;
const DELIVERY_FEE = 350;
const UNIT_COST = 80_000;

test.afterEach(async () => resetDb());

test('web COD checkout, warehouse, courier and cash handover reconcile exactly once', async ({ page, request }) => {
  await resetDb();
  const { product, unit } = await seedProduct('ecosystem-courier-cod', PRODUCT_PRICE, UNIT_COST);
  await prisma.deviceUnit.update({ where: { id: unit.id }, data: { acquisitionCost: UNIT_COST } });
  const owner = await seedStaffCredentials('owner', 'ecosystem-cod-owner');
  const courier = await seedStaffCredentials('courier', 'ecosystem-cod-courier');
  const cashier = await seedStaffCredentials('cashier', 'ecosystem-cod-cashier');
  const now = new Date();
  const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const localDayStart = new Date(`${localDay}T00:00:00.000Z`);
  const startsAt = now.toISOString().slice(0, 10) === localDay
    ? new Date(now.getTime() + 10 * 60_000)
    : localDayStart;
  const endsAt = new Date(Math.min(
    startsAt.getTime() + 2 * 60 * 60_000,
    localDayStart.getTime() + 24 * 60 * 60_000 - 1,
  ));
  const zone = await prisma.deliveryZone.create({
    data: {
      code: `ecosystem-cod-${Date.now().toString(36)}`,
      name: 'COD зона Бишкек',
      fee: DELIVERY_FEE,
      etaMinMinutes: 30,
      etaMaxMinutes: 120,
      createdBy: owner.staffId,
      idempotencyKey: `ecosystem-cod-zone-${Date.now()}`,
      slots: {
        create: {
          startsAt,
          endsAt,
          capacity: 1,
          createdBy: owner.staffId,
          idempotencyKey: `ecosystem-cod-slot-${Date.now()}`,
        },
      },
    },
    include: { slots: true },
  });
  await page.addInitScript((item) => {
    localStorage.setItem('alistore.cart.v1', JSON.stringify([{ ...item, qty: 1 }]));
    localStorage.removeItem('alistore.cart.pricing.v1');
  }, { id: product.id, sku: product.sku, name: product.name, price: product.price });

  await page.goto('/checkout');
  await page.getByRole('button', { name: /Курьер/ }).click();
  await expect(page.getByLabel('Зона доставки')).toHaveValue(zone.id);
  await page.getByRole('textbox', { name: 'Точный адрес доставки' }).fill('Бишкек, ул. Токтогула 125/1, кв. 42');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  await page.getByPlaceholder('+996 700 12 34 56').fill(`+996700${Date.now().toString().slice(-6)}`);
  await page.getByPlaceholder('Имя').fill('COD Buyer');
  await page.getByRole('button', { name: 'Далее' }).last().click();
  const cashOnDelivery = page.getByRole('button', { name: /Наличными при получении/ });
  await cashOnDelivery.click();
  await expect(cashOnDelivery).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'К подтверждению' }).click();
  await page.getByLabel(/Согласен с условиями/).check();
  await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
  await expect(page.getByText('Заказ оформлен!')).toBeVisible();

  const order = await prisma.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' }, include: { items: true } });
  expect(order).toMatchObject({
    status: 'created',
    fulfillmentType: 'courier',
    paymentMode: 'cod',
    deliveryZoneId: zone.id,
    deliverySlotId: zone.slots[0].id,
    deliveryFee: DELIVERY_FEE,
    total: PRODUCT_PRICE + DELIVERY_FEE,
  });
  expect(order.taxBaseAmount + order.taxAmount).toBe(order.subtotal - order.promoDiscount);
  expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);

  await postJson(request, `/orders/${order.id}/fulfill`, {}, owner.accessToken);
  const fakePaid = await request.post(`${API_BASE}/orders/${order.id}/transition`, {
    data: { to: 'paid' },
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  expect(fakePaid.status()).toBe(409);
  expect(await fakePaid.json()).toMatchObject({ code: 'order_payment_unsettled' });
  await postJson(request, `/orders/${order.id}/transition`, { to: 'picking' }, owner.accessToken);
  await postJson(request, `/orders/${order.id}/transition`, { to: 'packed' }, owner.accessToken);

  const assignmentKey = `ecosystem-cod-assign-${order.id}`;
  const assignment = { courierId: courier.staffId, orderIds: [order.id], codTotal: order.total };
  const run = await postJson<{ id: string; orderIds: string[]; codTotal: number }>(
    request,
    '/courier/runs',
    assignment,
    owner.accessToken,
    { 'idempotency-key': assignmentKey },
  );
  const runReplay = await postJson<{ id: string; orderIds: string[]; codTotal: number }>(
    request,
    '/courier/runs',
    assignment,
    owner.accessToken,
    { 'idempotency-key': assignmentKey },
  );
  expect(runReplay).toMatchObject({ id: run.id, orderIds: [order.id], codTotal: order.total });
  expect(await prisma.courierRun.count()).toBe(1);

  const mine = await request.get(`${API_BASE}/courier/me/deliveries`, {
    headers: { authorization: `Bearer ${courier.accessToken}` },
  });
  expect(mine.ok()).toBeTruthy();
  expect(await mine.json()).toEqual([expect.objectContaining({ id: order.id, status: 'courier_assigned' })]);

  const startKey = `ecosystem-cod-start-${order.id}`;
  await postJson(request, `/courier/orders/${order.id}/start`, {}, courier.accessToken, { 'idempotency-key': startKey });
  await postJson(request, `/courier/orders/${order.id}/start`, {}, courier.accessToken, { 'idempotency-key': startKey });

  const prematureCompletion = await request.post(`${API_BASE}/orders/${order.id}/transition`, {
    data: { to: 'completed' },
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  expect(prematureCompletion.status()).toBe(422);

  const deliveryKey = `ecosystem-cod-deliver-${order.id}`;
  await postJson(request, `/courier/orders/${order.id}/deliver`, { codAmount: order.total }, courier.accessToken, { 'idempotency-key': deliveryKey });
  await postJson(request, `/courier/orders/${order.id}/deliver`, { codAmount: order.total }, courier.accessToken, { 'idempotency-key': deliveryKey });
  const unreconciledCompletion = await request.post(`${API_BASE}/orders/${order.id}/transition`, {
    data: { to: 'completed' },
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  expect(unreconciledCompletion.status()).toBe(409);
  expect(await unreconciledCompletion.json()).toMatchObject({ code: 'order_money_unreconciled' });

  const handoverKey = `ecosystem-cod-handover-${run.id}`;
  const handover = await postJson<{ id: string; handedOver: boolean; diff: number }>(
    request,
    '/courier/handover',
    { runId: run.id, amount: order.total },
    cashier.accessToken,
    { 'idempotency-key': handoverKey },
  );
  const handoverReplay = await postJson<{ id: string; handedOver: boolean; diff: number }>(
    request,
    '/courier/handover',
    { runId: run.id, amount: order.total },
    cashier.accessToken,
    { 'idempotency-key': handoverKey },
  );
  expect(handoverReplay).toMatchObject({ id: handover.id, handedOver: true, diff: 0 });
  const completionResponses = await Promise.all([
    request.post(`${API_BASE}/orders/${order.id}/transition`, {
      data: { to: 'completed' },
      headers: { authorization: `Bearer ${owner.accessToken}` },
    }),
    request.post(`${API_BASE}/orders/${order.id}/transition`, {
      data: { to: 'completed' },
      headers: { authorization: `Bearer ${owner.accessToken}` },
    }),
  ]);
  expect(completionResponses.map((response) => response.status()).sort()).toEqual([201, 422]);

  const [finalOrder, finalRun, finalUnit, reservation, issue] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.courierRun.findUniqueOrThrow({ where: { id: run.id } }),
    prisma.deviceUnit.findUniqueOrThrow({ where: { id: unit.id } }),
    prisma.reservation.findFirstOrThrow({ where: { orderId: order.id } }),
    prisma.inventoryValuationIssue.findFirstOrThrow({ where: { orderId: order.id } }),
  ]);
  expect(finalOrder).toMatchObject({ status: 'completed', paymentMode: 'cod', courierId: courier.staffId, courierRunId: run.id });
  expect(finalRun).toMatchObject({ codTotal: order.total, collectedTotal: order.total, handoverAmount: order.total, handedOver: true });
  expect(finalUnit).toMatchObject({ status: 'sold', orderId: order.id });
  expect(reservation.active).toBe(false);
  expect(issue).toMatchObject({ quantity: 1, unitCost: UNIT_COST, totalCost: UNIT_COST });
  expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  expect(await prisma.customer.findUniqueOrThrow({ where: { id: order.customerId } })).toMatchObject({ ltv: order.total });

  const entries = await prisma.accountingJournalEntry.findMany({
    where: {
      OR: [
        { sourceType: 'cod.receivable', sourceRef: order.id },
        { sourceType: 'cod.handover', sourceRef: `${run.id}:${handoverKey}` },
        { sourceType: 'inventory.cogs', sourceRef: issue.id },
      ],
    },
    include: { lines: true },
  });
  expect(entries).toHaveLength(3);
  const byType = new Map(entries.map((entry) => [entry.sourceType, entry]));
  expect(linesByAccount(byType.get('cod.receivable')?.lines ?? [])).toEqual({
    '1100': { debit: order.total, credit: 0 },
    '2200': { debit: 0, credit: order.taxAmount },
    '4000': { debit: 0, credit: order.total - order.taxAmount },
  });
  expect(linesByAccount(byType.get('cod.handover')?.lines ?? [])).toEqual({
    '1000': { debit: order.total, credit: 0 },
    '1100': { debit: 0, credit: order.total },
  });
  expect(linesByAccount(byType.get('inventory.cogs')?.lines ?? [])).toEqual({
    '1200': { debit: 0, credit: UNIT_COST },
    '5000': { debit: UNIT_COST, credit: 0 },
  });
  for (const entry of entries) {
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(entry.lines.reduce((sum, line) => sum + line.credit, 0));
    expect(await prisma.auditEvent.count({ where: { type: 'accounting.entry_posted', refs: { has: entry.id } } })).toBe(1);
  }

  for (const type of ['order.created', 'stock.reserved', 'order.picking', 'order.packed', 'delivery.assigned', 'delivery.out', 'delivery.delivered', 'cash.handover', 'unit.sold', 'order.completed']) {
    expect(await prisma.auditEvent.count({ where: { type, refs: { hasSome: [order.id, run.id, unit.imei] } } }), type).toBe(1);
  }
});

function linesByAccount(lines: Array<{ accountCode: string; debit: number; credit: number }>) {
  return Object.fromEntries(
    lines
      .map((line) => [line.accountCode, { debit: line.debit, credit: line.credit }] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
