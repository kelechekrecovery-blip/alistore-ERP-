import { expect, test } from '@playwright/test';
import { postJson, prisma, resetDb, seedStaffCredentials } from './helpers';

test.afterEach(async () => resetDb());

test('partial procurement receiving becomes exactly-once sellable stock with reconciled AP and COGS', async ({ request }) => {
  await resetDb();
  const owner = await seedStaffCredentials('owner', 'ecosystem-procurement-owner');
  const warehouse = await seedStaffCredentials('warehouse', 'ecosystem-procurement-warehouse');
  const cashier = await seedStaffCredentials('cashier', 'ecosystem-procurement-cashier');
  const supplier = await prisma.supplier.create({ data: { name: `Ecosystem supplier ${Date.now()}` } });
  const product = await prisma.product.create({
    data: { sku: `ECO-PO-${Date.now()}`, name: 'Ecosystem procurement phone', price: 100_000, cost: 1, category: 'phones', attrs: {} },
  });
  const createKey = `ecosystem-po-create-${product.id}`;
  const purchaseOrder = await postJson<{ id: string; status: string; items: Array<{ id: string }> }>(request, '/procurement/purchase-orders', {
    idempotencyKey: createKey,
    supplierId: supplier.id,
    location: 'BISHKEK-1',
    items: [{ productId: product.id, qty: 2, unitCost: 70_000 }],
  }, owner.accessToken);
  const createReplay = await postJson<{ id: string; idempotent: boolean }>(request, '/procurement/purchase-orders', {
    idempotencyKey: createKey,
    supplierId: supplier.id,
    location: 'BISHKEK-1',
    items: [{ productId: product.id, qty: 2, unitCost: 70_000 }],
  }, owner.accessToken);
  expect(createReplay).toMatchObject({ id: purchaseOrder.id, idempotent: true });
  await postJson(request, `/procurement/purchase-orders/${purchaseOrder.id}/send`, {}, owner.accessToken);

  const itemId = purchaseOrder.items[0].id;
  const firstImei = `ECO-PO-${Date.now()}-01`;
  const secondImei = `ECO-PO-${Date.now()}-02`;
  const firstReceiptBody = { idempotencyKey: `ecosystem-receipt-${purchaseOrder.id}-1`, lines: [{ itemId, imeis: [firstImei], grade: 'A' }] };
  const partial = await postJson<{ status: string; receiptId: string; idempotent: boolean }>(request, `/procurement/purchase-orders/${purchaseOrder.id}/receive`, firstReceiptBody, warehouse.accessToken);
  expect(partial).toMatchObject({ status: 'receiving', idempotent: false });
  const partialReplay = await postJson<{ status: string; receiptId: string; idempotent: boolean }>(request, `/procurement/purchase-orders/${purchaseOrder.id}/receive`, firstReceiptBody, warehouse.accessToken);
  expect(partialReplay).toMatchObject({ status: 'receiving', receiptId: partial.receiptId, idempotent: true });
  const completed = await postJson<{ status: string; receiptId: string; idempotent: boolean }>(request, `/procurement/purchase-orders/${purchaseOrder.id}/receive`, {
    idempotencyKey: `ecosystem-receipt-${purchaseOrder.id}-2`,
    lines: [{ itemId, imeis: [secondImei], grade: 'A' }],
  }, warehouse.accessToken);
  expect(completed).toMatchObject({ status: 'received', idempotent: false });

  const saleBody = {
    point: 'BISHKEK-1',
    method: 'cash',
    clientSaleId: `ecosystem-procurement-sale-${firstImei}`,
    lines: [{ productId: product.id, sku: product.sku, price: 100_000, qty: 1, imei: firstImei }],
  };
  // POS-продажа наличными требует открытую смену у кассира (изменение поведения
  // 461126ba: раньше открывалась фантомная смена, теперь продажа отклоняется).
  await prisma.cashShift.create({ data: { staffId: cashier.staffId, point: 'BISHKEK-1', openCash: 0, openedAt: new Date() } });
  const sale = await postJson<{ orderId: string; status: string }>(request, '/pos/sale', saleBody, cashier.accessToken);
  const saleReplay = await postJson<{ orderId: string; status: string }>(request, '/pos/sale', saleBody, cashier.accessToken);
  expect(saleReplay).toMatchObject({ orderId: sale.orderId, status: 'paid' });

  const [finalPo, receipts, units, movements, order, payments, saleIssue] = await Promise.all([
    prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrder.id }, include: { items: true } }),
    prisma.purchaseReceipt.findMany({ where: { purchaseOrderId: purchaseOrder.id }, orderBy: { createdAt: 'asc' } }),
    prisma.deviceUnit.findMany({ where: { productId: product.id }, orderBy: { imei: 'asc' } }),
    prisma.inventoryMovement.findMany({ where: { productId: product.id, type: 'received' }, orderBy: { createdAt: 'asc' } }),
    prisma.order.findUniqueOrThrow({ where: { id: sale.orderId }, include: { items: true } }),
    prisma.payment.findMany({ where: { orderId: sale.orderId } }),
    prisma.inventoryValuationIssue.findUniqueOrThrow({ where: { sourceType_sourceRef: { sourceType: 'sale', sourceRef: `${sale.orderId}:${firstImei}` } } }),
  ]);
  expect(finalPo).toMatchObject({ status: 'received', supplierId: supplier.id, location: 'BISHKEK-1' });
  expect(finalPo.items).toHaveLength(1);
  expect(finalPo.items[0]).toMatchObject({ orderedQty: 2, receivedQty: 2, unitCost: 70_000 });
  expect(receipts).toHaveLength(2);
  expect(receipts.every((receipt) => receipt.accountingEntryId)).toBe(true);
  expect(units.map(({ imei, status, location, acquisitionCost, orderId }) => ({ imei, status, location, acquisitionCost, orderId }))).toEqual([
    { imei: firstImei, status: 'sold', location: 'BISHKEK-1', acquisitionCost: 70_000, orderId: sale.orderId },
    { imei: secondImei, status: 'in_stock', location: 'BISHKEK-1', acquisitionCost: 70_000, orderId: null },
  ]);
  expect(movements).toHaveLength(2);
  expect(movements.map(({ qty, unitCost, totalValue }) => ({ qty, unitCost, totalValue }))).toEqual([
    { qty: 1, unitCost: 70_000, totalValue: 70_000 },
    { qty: 1, unitCost: 70_000, totalValue: 70_000 },
  ]);
  expect(order).toMatchObject({ status: 'paid', total: 100_000 });
  expect(order.taxBaseAmount + order.taxAmount).toBe(100_000);
  expect(order.items).toHaveLength(1);
  expect(order.items[0]).toMatchObject({
    sku: product.sku,
    qty: 1,
    price: 100_000,
    unitCost: 70_000,
    imei: firstImei,
    discountAmount: 0,
    taxCode: 'vat_standard',
    taxRateBps: 1200,
  });
  expect(order.items[0].taxBaseAmount + order.items[0].taxAmount).toBe(100_000);
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ amount: 100_000, method: 'cash', status: 'received', accountCode: '1000', point: 'BISHKEK-1', receivedBy: cashier.staffId });
  expect(saleIssue).toMatchObject({ imei: firstImei, quantity: 1, unitCost: 70_000, totalCost: 70_000, reversedQty: 0 });

  const receiptEntries = await prisma.accountingJournalEntry.findMany({
    where: { sourceType: 'procurement.receipt', sourceRef: { in: receipts.map((receipt) => receipt.id) } },
    include: { lines: true },
  });
  expect(receiptEntries).toHaveLength(2);
  for (const receipt of receipts) {
    const entry = receiptEntries.find((candidate) => candidate.sourceRef === receipt.id)!;
    expect(receipt.accountingEntryId).toBe(entry.id);
    expect(linesByAccount(entry.lines)).toEqual({ '1200': { debit: 70_000, credit: 0 }, '2000': { debit: 0, credit: 70_000 } });
  }
  const saleEntries = await prisma.accountingJournalEntry.findMany({
    where: { OR: [{ sourceType: 'payment.receipt', sourceRef: payments[0].id }, { sourceType: 'inventory.cogs', sourceRef: saleIssue.id }] },
    include: { lines: true },
  });
  expect(saleEntries).toHaveLength(2);
  const receiptEntry = saleEntries.find((entry) => entry.sourceType === 'payment.receipt')!;
  const cogsEntry = saleEntries.find((entry) => entry.sourceType === 'inventory.cogs')!;
  expect(receiptEntry).toMatchObject({ point: 'BISHKEK-1', documentAmount: 100_000, baseAmount: 100_000, taxCode: 'vat_output:vat_standard', taxRateBps: 1200, taxAmount: order.taxAmount });
  expect(linesByAccount(receiptEntry.lines)).toEqual({
    '1000': { debit: 100_000, credit: 0 },
    '2200': { debit: 0, credit: order.taxAmount },
    '4000': { debit: 0, credit: order.taxBaseAmount },
  });
  expect(linesByAccount(cogsEntry.lines)).toEqual({
    '1200': { debit: 0, credit: 70_000 },
    '5000': { debit: 70_000, credit: 0 },
  });
  expect(payments[0].accountingEntryId).toBe(receiptEntry.id);
  for (const entry of [...receiptEntries, ...saleEntries]) {
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(entry.lines.reduce((sum, line) => sum + line.credit, 0));
    expect(await prisma.auditEvent.count({ where: { type: 'accounting.entry_posted', refs: { has: entry.id } } })).toBe(1);
  }
  const poCreated = await exactEvent('purchase_order.created', purchaseOrder.id);
  expect(poCreated).toMatchObject({ actor: owner.staffId, payload: { purchaseOrderId: purchaseOrder.id, supplierId: supplier.id, location: 'BISHKEK-1', items: 1 } });
  const poSent = await exactEvent('purchase_order.sent', purchaseOrder.id);
  expect(poSent.actor).toBe(owner.staffId);
  for (const [index, receipt] of receipts.entries()) {
    const imei = index === 0 ? firstImei : secondImei;
    const transition = await exactEvent(index === 0 ? 'purchase_order.receiving' : 'purchase_order.received', receipt.id);
    expect(transition).toMatchObject({ actor: warehouse.staffId, payload: { purchaseOrderId: purchaseOrder.id, receiptId: receipt.id, units: 1 } });
    const unitReceived = await exactEvent('unit.received', imei);
    expect(unitReceived).toMatchObject({ actor: warehouse.staffId, payload: { purchaseOrderId: purchaseOrder.id, receiptId: receipt.id, productId: product.id, imei, location: 'BISHKEK-1', grade: 'A' } });
    expect(unitReceived.refs).toEqual(expect.arrayContaining([purchaseOrder.id, receipt.id, product.id, imei]));
    const stockReceived = await exactEvent('stock.received', receipt.id);
    const stockPayload = stockReceived.payload as { purchaseOrderId?: string; receiptId?: string; productId?: string; qty?: number; location?: string; movementId?: string };
    expect(stockReceived.actor).toBe(warehouse.staffId);
    expect(stockPayload).toMatchObject({ purchaseOrderId: purchaseOrder.id, receiptId: receipt.id, productId: product.id, qty: 1, location: 'BISHKEK-1', movementId: expect.any(String) });
    expect(movements.some((movement) => movement.id === stockPayload.movementId)).toBe(true);
    expect(stockReceived.refs).toEqual(expect.arrayContaining([purchaseOrder.id, receipt.id, product.id, stockPayload.movementId]));
  }
  const paymentReceived = await exactEvent('payment.received', payments[0].id);
  expect(paymentReceived).toMatchObject({ actor: cashier.staffId, payload: { orderId: sale.orderId, amount: 100_000, method: 'cash', point: 'BISHKEK-1', accountCode: '1000', accountingEntryId: receiptEntry.id, taxAmount: order.taxAmount } });
  expect(paymentReceived.refs).toEqual(expect.arrayContaining([sale.orderId, payments[0].id]));
  const unitSold = await exactEvent('unit.sold', firstImei);
  expect(unitSold).toMatchObject({ actor: cashier.staffId, payload: { orderId: sale.orderId, imei: firstImei } });
  expect(unitSold.refs).toEqual(expect.arrayContaining([sale.orderId, firstImei]));
  const orderPaid = await exactEvent('order.paid', sale.orderId);
  expect(orderPaid).toMatchObject({ actor: cashier.staffId, payload: { orderId: sale.orderId, total: 100_000 } });
  expect(await prisma.purchaseOrder.count({ where: { id: purchaseOrder.id } })).toBe(1);
  expect(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(2);
});

function linesByAccount(lines: Array<{ accountCode: string; debit: number; credit: number }>) {
  expect(lines).toHaveLength(new Set(lines.map((line) => line.accountCode)).size);
  return Object.fromEntries(lines.map((line) => [line.accountCode, { debit: line.debit, credit: line.credit }]).sort(([left], [right]) => left.localeCompare(right)));
}

async function exactEvent(type: string, ref: string) {
  const events = await prisma.auditEvent.findMany({ where: { type, refs: { has: ref } } });
  expect(events, `${type}:${ref}`).toHaveLength(1);
  return events[0];
}
