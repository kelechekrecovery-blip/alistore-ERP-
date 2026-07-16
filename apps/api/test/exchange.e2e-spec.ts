import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ExchangesService } from '../src/exchanges/exchanges.service';
import { ValidationError } from '../src/common/errors';
import { CustomersService } from '../src/customers/customers.service';
import { UnitsService } from '../src/units/units.service';
import { includedTax } from '../src/finance/sales-tax';
import { postCogsOnTx } from '../src/inventory/inventory-valuation';
import { postPaymentEntryOnTx } from '../src/finance/accounting-journal';
import { EventType } from '../src/audit/event-types';

/**
 * Обмен (Phase 6): atomic return + sale + surcharge. Old unit → returned, new
 * unit → sold on a new paid order, original order → exchanged, доплата collected.
 * A cheaper exchange is refused (must go through return + gated refund).
 */
describe('Exchange (integration)', () => {
  let prisma: PrismaService;
  let exchanges: ExchangesService;
  let customers: CustomersService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    exchanges = new ExchangesService(prisma, audit, new UnitsService(prisma));
    customers = new CustomersService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.inventoryQuarantineCase.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.inventoryQuarantineCase.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { sourceType: { in: ['payment.receipt', 'exchange.return', 'exchange.sale', 'exchange.surcharge', 'inventory.cogs', 'inventory.return'] } } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { sourceType: { in: ['payment.receipt', 'exchange.return', 'exchange.sale', 'exchange.surcharge', 'inventory.cogs', 'inventory.return'] } },
      }),
    ]);
    await prisma.inventoryValuationIssue.deleteMany();
    await prisma.inventoryValuationLayer.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany({ where: { staffId: { startsWith: 'exchange-' } } });
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function setup(oldPrice: number, newPrice: number, actor = 'exchange-cashier') {
    seq += 1;
    const customer = await prisma.customer.create({ data: { phone: `+9967004${seq.toString().padStart(4, '0')}`, name: 'T' } });
    const oldProduct = await prisma.product.create({
      data: { sku: `EX-OLD-${seq}`, name: 'old', price: oldPrice, cost: 70000, category: 'c', taxCode: 'vat_standard', taxRateBps: 1200, attrs: {} },
    });
    const newProduct = await prisma.product.create({
      data: { sku: `EX-NEW-${seq}`, name: 'new', price: newPrice, cost: 90000, category: 'c', taxCode: 'vat_standard', taxRateBps: 1200, attrs: {} },
    });
    const oldImei = `EX-OLD-${seq}-1`;
    await prisma.deviceUnit.create({ data: { imei: oldImei, productId: oldProduct.id, status: 'sold', location: 'B', acquisitionCost: 70000 } });
    await prisma.deviceUnit.create({ data: { imei: `EX-NEW-${seq}-1`, productId: newProduct.id, status: 'in_stock', location: 'B', acquisitionCost: 90000 } });
    const oldTax = includedTax(oldPrice, oldProduct.taxRateBps);
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        storePointCode: 'B',
        fulfillmentLocation: 'B',
        subtotal: oldPrice,
        total: oldPrice,
        taxBaseAmount: oldPrice - oldTax,
        taxAmount: oldTax,
        status: 'paid',
        items: { create: [{
          lineNumber: 1,
          sku: oldProduct.sku,
          qty: 1,
          price: oldPrice,
          unitCost: 70000,
          taxCode: oldProduct.taxCode,
          taxRateBps: oldProduct.taxRateBps,
          taxBaseAmount: oldPrice - oldTax,
          taxAmount: oldTax,
          imei: oldImei,
        }] },
      },
    });
    await prisma.deviceUnit.update({ where: { imei: oldImei }, data: { orderId: order.id } });
    const originalPayment = await prisma.payment.create({
      data: { orderId: order.id, amount: oldPrice, method: 'card', status: 'received', txnId: `exchange-original-${seq}` },
    });
    await prisma.$transaction((tx) => postPaymentEntryOnTx(tx, {
      payment: originalPayment,
      idempotencyKey: `exchange-original-${seq}`,
      point: 'B',
      actor,
      tax: { taxCode: oldProduct.taxCode, taxRateBps: oldProduct.taxRateBps, taxAmount: oldTax },
    }));
    await prisma.$transaction((tx) => postCogsOnTx(tx, {
      productId: oldProduct.id,
      orderId: order.id,
      sourceRef: `${order.id}:${oldImei}`,
      imei: oldImei,
      quantity: 1,
      unitCost: 70000,
      actor,
    }));
    const shift = await prisma.cashShift.create({ data: { staffId: actor, point: 'B', openCash: 10000 } });
    return { customer, order, oldImei, newProduct, shift, actor, oldTax };
  }

  it('swaps devices, collects surcharge, marks original exchanged', async () => {
    const { customer, order, oldImei, newProduct, shift, actor, oldTax } = await setup(100000, 130000);

    const res = await exchanges.exchange(
      { originalOrderId: order.id, oldImei, newProductId: newProduct.id, method: 'cash', shiftId: shift.id },
      actor,
    );
    expect(res.surcharge).toBe(30000);

    expect((await prisma.deviceUnit.findUnique({ where: { imei: oldImei } }))?.status).toBe('returned');
    expect((await prisma.deviceUnit.findUnique({ where: { imei: res.newImei } }))?.status).toBe('sold');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('exchanged');

    const newOrder = await prisma.order.findUnique({ where: { id: res.exchangeOrderId }, include: { items: true } });
    expect(newOrder?.status).toBe('paid');
    expect(newOrder?.channel).toBe('exchange');
    const newTax = includedTax(130000, newProduct.taxRateBps);
    expect(newOrder).toMatchObject({ subtotal: 130000, taxBaseAmount: 130000 - newTax, taxAmount: newTax });
    expect(newOrder?.items[0]).toMatchObject({ unitCost: 90000, taxBaseAmount: 130000 - newTax, taxAmount: newTax });

    const payment = await prisma.payment.findFirst({ where: { orderId: res.exchangeOrderId } });
    expect(payment).toMatchObject({ amount: 30000, shiftId: shift.id, accountCode: '1000', receivedBy: actor, point: 'B' });
    const ret = await prisma.return.findUniqueOrThrow({ where: { id: res.returnId }, include: { items: true } });
    expect(ret).toMatchObject({ refundAmount: 100000, isFullOrder: true, status: 'reconciled' });
    expect(ret.items).toEqual([expect.objectContaining({ qty: 1, refundAmount: 100000 })]);
    expect(await prisma.inventoryQuarantineCase.findFirstOrThrow({
      where: { sourceType: 'exchange', returnId: res.returnId },
    })).toMatchObject({ status: 'pending_diagnosis' });

    const accounting = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: { in: ['exchange.return', 'exchange.sale', 'exchange.surcharge'] } },
      include: { lines: true },
    });
    expect(accounting).toHaveLength(3);
    const returnEntry = accounting.find((entry) => entry.sourceType === 'exchange.return')!;
    expect(returnEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '4000', debit: 100000 - oldTax }),
      expect.objectContaining({ accountCode: '2200', debit: oldTax }),
      expect.objectContaining({ accountCode: '1100', credit: 100000 }),
    ]));
    const saleEntry = accounting.find((entry) => entry.sourceType === 'exchange.sale')!;
    expect(saleEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 130000 }),
      expect.objectContaining({ accountCode: '4000', credit: 130000 - newTax }),
      expect.objectContaining({ accountCode: '2200', credit: newTax }),
    ]));
    const surchargeEntry = accounting.find((entry) => entry.sourceType === 'exchange.surcharge')!;
    expect(surchargeEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1000', debit: 30000 }),
      expect.objectContaining({ accountCode: '1100', credit: 30000 }),
    ]));
    const arNet = accounting.flatMap((entry) => entry.lines)
      .filter((line) => line.accountCode === '1100')
      .reduce((sum, line) => sum + line.debit - line.credit, 0);
    expect(arNet).toBe(0);
    const oldIssue = await prisma.inventoryValuationIssue.findFirstOrThrow({ where: { orderId: order.id, imei: oldImei } });
    const newIssue = await prisma.inventoryValuationIssue.findFirstOrThrow({ where: { orderId: res.exchangeOrderId, imei: res.newImei } });
    expect(oldIssue).toMatchObject({ reversedQty: 1, totalCost: 70000 });
    expect(newIssue).toMatchObject({ reversedQty: 0, totalCost: 90000 });
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'inventory.return', sourceRef: { startsWith: `${res.returnId}:` } } })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'inventory.cogs', sourceRef: newIssue.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: EventType.AccountingEntryPosted, refs: { has: res.exchangeOrderId } } })).toBeGreaterThanOrEqual(3);

    const devices = await customers.devices(customer.id);
    const newDevice = devices.find((device) => device.imei === res.newImei);
    expect(newDevice?.warrantyUntil).toBeTruthy();
    expect(newDevice?.daysLeft).toBeGreaterThan(300);

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'unit.returned',
        EventType.InventoryQuarantined,
        'return.completed',
        'order.created',
        'unit.sold',
        'order.paid',
        'payment.received',
        'order.exchanged',
      ]),
    );
  });

  it('refuses a cheaper exchange (must use return + refund)', async () => {
    const { order, oldImei, newProduct } = await setup(130000, 100000);
    const err = await exchanges
      .exchange({ originalOrderId: order.id, oldImei, newProductId: newProduct.id, method: 'cash' }, 'exchange-cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('exchange_needs_refund');
  });

  it('replays the same exchange idempotently and rejects key reuse', async () => {
    const first = await setup(100000, 130000);
    const dto = { originalOrderId: first.order.id, oldImei: first.oldImei, newProductId: first.newProduct.id, method: 'cash' as const, shiftId: first.shift.id };
    const created = await exchanges.exchange(dto, first.actor, 'stable-exchange');
    const replay = await exchanges.exchange(dto, first.actor, 'stable-exchange');

    expect(replay.exchangeOrderId).toBe(created.exchangeOrderId);
    expect(replay.idempotent).toBe(true);
    expect(await prisma.order.count({ where: { channel: 'exchange' } })).toBe(1);
    expect(await prisma.return.count({ where: { id: created.returnId } })).toBe(1);
    const surcharge = await prisma.payment.findFirstOrThrow({ where: { orderId: created.exchangeOrderId } });
    expect(await prisma.payment.count({ where: { orderId: created.exchangeOrderId } })).toBe(1);
    expect(await prisma.accountingJournalEntry.count({
      where: {
        sourceType: { in: ['exchange.return', 'exchange.sale', 'exchange.surcharge'] },
        sourceRef: { in: [created.returnId, created.exchangeOrderId, surcharge.id] },
      },
    })).toBe(3);
    expect(await prisma.inventoryValuationIssue.count({ where: { orderId: created.exchangeOrderId, sourceType: 'sale' } })).toBe(1);

    const other = await setup(100000, 140000);
    const error = await exchanges.exchange(
      { originalOrderId: other.order.id, oldImei: other.oldImei, newProductId: other.newProduct.id, method: 'cash', shiftId: other.shift.id },
      other.actor,
      'stable-exchange',
    ).catch((cause) => cause);
    expect(error.code).toBe('idempotency_key_reused');
  });

  it('requires provider reference for non-cash surcharge and rolls back the exchange', async () => {
    const fixture = await setup(100000, 130000);
    await expect(exchanges.exchange({
      originalOrderId: fixture.order.id,
      oldImei: fixture.oldImei,
      newProductId: fixture.newProduct.id,
      method: 'card',
    }, fixture.actor, 'missing-provider-reference')).rejects.toMatchObject({ code: 'exchange_external_reference_required' });
    expect(await prisma.return.count({ where: { orderId: fixture.order.id, reason: 'обмен' } })).toBe(0);
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: fixture.oldImei } })).toMatchObject({ status: 'sold', orderId: fixture.order.id });
    expect(await prisma.order.count({ where: { channel: 'exchange' } })).toBe(0);
  });

  it('replays an equal-price exchange without creating a synthetic payment', async () => {
    const fixture = await setup(100000, 100000);
    const dto = {
      originalOrderId: fixture.order.id,
      oldImei: fixture.oldImei,
      newProductId: fixture.newProduct.id,
      method: 'card' as const,
    };
    const created = await exchanges.exchange(dto, fixture.actor, 'equal-price-exchange');
    const replay = await exchanges.exchange(dto, fixture.actor, 'equal-price-exchange');
    expect(created.surcharge).toBe(0);
    expect(replay).toMatchObject({ exchangeOrderId: created.exchangeOrderId, surcharge: 0, idempotent: true });
    expect(await prisma.payment.count({ where: { orderId: created.exchangeOrderId } })).toBe(0);
  });
});
