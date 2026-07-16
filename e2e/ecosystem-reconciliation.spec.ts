import { expect, test } from '@playwright/test';
import { sign } from 'jsonwebtoken';
import { authenticator } from '../apps/api/node_modules/otplib';
import { patchJson, postJson, prisma, resetDb, seedProduct, seedStaffCredentials } from './helpers';

const SALE_AMOUNT = 100_000;
const UNIT_COST = 80_000;

test('POS sale, customer return, approved refund and warehouse receipt reconcile exactly once', async ({ request }) => {
  await resetDb();
  const { product, unit } = await seedProduct('ecosystem-reconciliation', SALE_AMOUNT, UNIT_COST);
  const cashier = await seedStaffCredentials('cashier', 'ecosystem-cashier');
  const warehouse = await seedStaffCredentials('warehouse', 'ecosystem-warehouse');
  const approver = await seedStaffCredentials('owner', 'ecosystem-approver');
  const approverSecret = authenticator.generateSecret();
  await prisma.staffUser.update({
    where: { id: approver.staffId },
    data: { totpEnabled: true, totpSecret: approverSecret },
  });

  const saleKey = `ecosystem-sale-${unit.id}`;
  const saleBody = {
    point: 'BISHKEK-1',
    method: 'cash',
    clientSaleId: saleKey,
    lines: [{ productId: product.id, sku: product.sku, price: SALE_AMOUNT, qty: 1, imei: unit.imei }],
  };
  const sale = await postJson<{ orderId: string; shiftId: string; status: string }>(
    request,
    '/pos/sale',
    saleBody,
    cashier.accessToken,
  );
  const saleReplay = await postJson<{ orderId: string; shiftId: string; status: string }>(
    request,
    '/pos/sale',
    saleBody,
    cashier.accessToken,
  );
  expect(saleReplay).toMatchObject({ orderId: sale.orderId, shiftId: sale.shiftId, status: 'paid' });

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: sale.orderId },
    include: { items: true, payments: { orderBy: { createdAt: 'asc' } } },
  });
  expect(order).toMatchObject({ status: 'paid', total: SALE_AMOUNT });
  expect(order.payments).toHaveLength(1);
  const originalPayment = order.payments[0];
  expect(originalPayment).toMatchObject({ amount: SALE_AMOUNT, method: 'cash', status: 'received' });

  const customerToken = sign(
    { sub: order.customerId, phone: '+000000000000', typ: 'customer' },
    'dev-secret-alistore-local',
    { expiresIn: '1h' },
  );
  const returnKey = `ecosystem-return-${order.id}`;
  const returnRequest = await postJson<{ id: string; status: string }>(
    request,
    '/returns/mine',
    { orderId: order.id, reason: 'Сквозная проверка полного возврата' },
    customerToken,
    { 'idempotency-key': returnKey },
  );
  const returnReplay = await postJson<{ id: string; status: string }>(
    request,
    '/returns/mine',
    { orderId: order.id, reason: 'Сквозная проверка полного возврата' },
    customerToken,
    { 'idempotency-key': returnKey },
  );
  expect(returnReplay.id).toBe(returnRequest.id);

  for (const status of ['under_review', 'approved', 'processing'] as const) {
    await patchJson(request, `/returns/${returnRequest.id}`, { status }, warehouse.accessToken);
  }

  const refundKey = `ecosystem-refund-${returnRequest.id}`;
  const refund = await postJson<{
    id: string;
    approvalId: string;
    status: string;
  }>(
    request,
    `/returns/${returnRequest.id}/refunds`,
    { reason: 'Товар принят для полного возврата', shiftId: sale.shiftId },
    cashier.accessToken,
    { 'idempotency-key': refundKey },
  );
  const refundReplay = await postJson<{ id: string }>(
    request,
    `/returns/${returnRequest.id}/refunds`,
    { reason: 'Товар принят для полного возврата', shiftId: sale.shiftId },
    cashier.accessToken,
    { 'idempotency-key': refundKey },
  );
  expect(refundReplay.id).toBe(refund.id);

  await patchJson(
    request,
    `/approvals/${refund.approvalId}/decide`,
    { status: 'approved', totpToken: authenticator.generate(approverSecret) },
    approver.accessToken,
  );
  const completedRefund = await postJson<{ id: string; status: string }>(
    request,
    `/refunds/${refund.id}/retry`,
    {},
    approver.accessToken,
  );
  expect(completedRefund).toMatchObject({ id: refund.id, status: 'succeeded' });
  const retryReplay = await postJson<{ id: string; status: string }>(
    request,
    `/refunds/${refund.id}/retry`,
    {},
    approver.accessToken,
  );
  expect(retryReplay).toMatchObject({ id: refund.id, status: 'succeeded' });

  await patchJson(
    request,
    `/returns/${returnRequest.id}`,
    { status: 'reconciled', location: 'RETURNS' },
    warehouse.accessToken,
  );
  await patchJson(
    request,
    `/returns/${returnRequest.id}`,
    { status: 'reconciled', location: 'RETURNS' },
    warehouse.accessToken,
  );

  const [finalOrder, finalReturn, finalRefund, payments, soldIssue, reversal, returnedUnit, quarantine] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.return.findUniqueOrThrow({ where: { id: returnRequest.id } }),
    prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
      include: { allocations: true, lines: true },
    }),
    prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } }),
    prisma.inventoryValuationIssue.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: 'sale', sourceRef: `${order.id}:${unit.imei}` } },
    }),
    prisma.inventoryValuationReversal.findFirstOrThrow({ where: { returnId: returnRequest.id } }),
    prisma.deviceUnit.findUniqueOrThrow({ where: { imei: unit.imei } }),
    prisma.inventoryQuarantineCase.findFirstOrThrow({ where: { returnId: returnRequest.id } }),
  ]);

  expect(finalOrder.status).toBe('refunded');
  expect(finalReturn).toMatchObject({ status: 'reconciled', restockLocation: 'RETURNS' });
  expect(finalRefund).toMatchObject({ status: 'succeeded', amount: SALE_AMOUNT, approver: approver.staffId });
  expect(finalRefund.allocations).toHaveLength(1);
  expect(finalRefund.allocations[0]).toMatchObject({
    originalPaymentId: originalPayment.id,
    amount: SALE_AMOUNT,
    status: 'succeeded',
  });
  expect(finalRefund.lines).toHaveLength(1);
  expect(finalRefund.lines[0]).toMatchObject({
    grossAmount: SALE_AMOUNT,
    taxBaseAmount: order.taxBaseAmount,
    taxAmount: order.taxAmount,
    revenueAmount: order.taxBaseAmount,
  });
  expect(order.taxBaseAmount + order.taxAmount).toBe(SALE_AMOUNT);

  expect(payments).toHaveLength(2);
  const refundPayment = payments.find((payment) => payment.amount < 0);
  expect(refundPayment).toMatchObject({
    amount: -SALE_AMOUNT,
    status: 'refunded',
    originalPaymentId: originalPayment.id,
  });
  expect(payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(0);
  expect(finalRefund.allocations[0].refundPaymentId).toBe(refundPayment?.id);

  expect(soldIssue).toMatchObject({ quantity: 1, reversedQty: 1, unitCost: UNIT_COST, totalCost: UNIT_COST });
  expect(reversal).toMatchObject({
    issueId: soldIssue.id,
    quantity: 1,
    unitCost: UNIT_COST,
    totalCost: UNIT_COST,
  });
  expect(returnedUnit).toMatchObject({ status: 'returned', location: 'RETURNS', orderId: null });
  expect(quarantine).toMatchObject({ sourceType: 'return', status: 'pending_diagnosis', unitCost: UNIT_COST });

  const journalEntries = await prisma.accountingJournalEntry.findMany({
    where: {
      OR: [
        { sourceType: 'payment.receipt', sourceRef: originalPayment.id },
        { sourceType: 'inventory.cogs', sourceRef: soldIssue.id },
        { sourceType: 'payment.refund', sourceRef: refundPayment?.id },
        { sourceType: 'inventory.return', sourceRef: reversal.sourceRef },
      ],
    },
    include: { lines: true },
  });
  expect(journalEntries.map((entry) => entry.sourceType).sort()).toEqual([
    'inventory.cogs',
    'inventory.return',
    'payment.receipt',
    'payment.refund',
  ]);
  const entryByType = new Map(journalEntries.map((entry) => [entry.sourceType, entry]));
  const receiptEntry = entryByType.get('payment.receipt');
  const cogsEntry = entryByType.get('inventory.cogs');
  const refundEntry = entryByType.get('payment.refund');
  const returnEntry = entryByType.get('inventory.return');
  expect(originalPayment.accountingEntryId).toBe(receiptEntry?.id);
  expect(finalRefund.allocations[0].accountingEntryId).toBe(refundEntry?.id);
  expect(receiptEntry).toMatchObject({
    documentAmount: SALE_AMOUNT,
    baseAmount: SALE_AMOUNT,
    taxAmount: order.taxAmount,
  });
  expect(refundEntry).toMatchObject({
    documentAmount: SALE_AMOUNT,
    baseAmount: SALE_AMOUNT,
    taxAmount: order.taxAmount,
  });
  expect(linesByAccount(receiptEntry?.lines ?? [])).toEqual({
    '1000': { debit: SALE_AMOUNT, credit: 0 },
    '2200': { debit: 0, credit: order.taxAmount },
    '4000': { debit: 0, credit: order.taxBaseAmount },
  });
  expect(linesByAccount(cogsEntry?.lines ?? [])).toEqual({
    '1200': { debit: 0, credit: UNIT_COST },
    '5000': { debit: UNIT_COST, credit: 0 },
  });
  expect(linesByAccount(refundEntry?.lines ?? [])).toEqual({
    '1000': { debit: 0, credit: SALE_AMOUNT },
    '2200': { debit: order.taxAmount, credit: 0 },
    '4000': { debit: order.taxBaseAmount, credit: 0 },
  });
  expect(linesByAccount(returnEntry?.lines ?? [])).toEqual({
    '1200': { debit: UNIT_COST, credit: 0 },
    '5000': { debit: 0, credit: UNIT_COST },
  });
  for (const entry of journalEntries) {
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(
      entry.lines.reduce((sum, line) => sum + line.credit, 0),
    );
    expect(await prisma.auditEvent.count({
      where: { type: 'accounting.entry_posted', refs: { has: entry.id } },
    })).toBe(1);
  }
  const accountNet = new Map<string, number>();
  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      accountNet.set(line.accountCode, (accountNet.get(line.accountCode) ?? 0) + line.debit - line.credit);
    }
  }
  expect([...accountNet.entries()].filter(([, amount]) => amount !== 0)).toEqual([]);

  const exactOnceEvents = [
    'payment.received',
    'unit.sold',
    'order.paid',
    'return.requested',
    'refund.requested',
    'refund.approved',
    'payment.refunded',
    'refund.succeeded',
    'order.refunded',
    'inventory.quarantined',
    'unit.returned',
    'return.completed',
  ];
  for (const type of exactOnceEvents) {
    expect(await prisma.auditEvent.count({
      where: { type, refs: { hasSome: [order.id, returnRequest.id, refund.id, unit.imei] } },
    }), type).toBe(1);
  }
  expect(await prisma.order.count({ where: { id: order.id } })).toBe(1);
  expect(await prisma.refund.count({ where: { returnId: returnRequest.id } })).toBe(1);
  expect(await prisma.inventoryValuationReversal.count({ where: { returnId: returnRequest.id } })).toBe(1);
  expect(await prisma.inventoryQuarantineCase.count({ where: { returnId: returnRequest.id } })).toBe(1);
});

function linesByAccount(lines: Array<{ accountCode: string; debit: number; credit: number }>) {
  return Object.fromEntries(
    lines
      .map((line) => [line.accountCode, { debit: line.debit, credit: line.credit }] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
