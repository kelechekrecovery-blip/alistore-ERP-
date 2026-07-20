import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsService } from '../src/reports/reports.service';

/**
 * ERP dashboard + Risk Center read straight from the Event Ledger tables:
 *  - money nets sales against refunds; orders/stock grouped by status;
 *  - risks surface cash discrepancies, outstanding COD, stale reservations, approvals.
 */
describe('Reports (integration)', () => {
  let prisma: PrismaService;
  let reports: ReportsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    reports = new ReportsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.$transaction(async (tx) => {
      // Journal-line balance is a deferred constraint: remove dependent lines
      // and entries in one transaction so the deleted entries are absent when
      // the deferred trigger validates its candidate ids.
      await tx.accountingJournalLine.deleteMany();
      await tx.accountingJournalEntry.deleteMany();
    });
    await prisma.customer.deleteMany();
  });

  it('nets sales against refunds and groups orders/stock', async () => {
    const customer = await prisma.customer.create({ data: { phone: '+996700900001', name: 'T' } });
    const product = await prisma.product.create({
      data: { sku: 'RP-1', name: 'x', price: 100000, cost: 80000, category: 'c', attrs: {} },
    });
    await prisma.deviceUnit.createMany({
      data: [
        { imei: 'RP-1-A', productId: product.id, status: 'sold', location: 'B' },
        { imei: 'RP-1-B', productId: product.id, status: 'in_stock', location: 'B' },
      ],
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total: 100000, status: 'paid' },
    });
    await prisma.payment.createMany({
      data: [
        { orderId: order.id, amount: 100000, method: 'cash', status: 'received' },
        { orderId: order.id, amount: -30000, method: 'cash', status: 'refunded' },
      ],
    });

    const d = await reports.dashboard();
    expect(d.money.salesGross).toBe(100000);
    expect(d.money.refunds).toBe(30000);
    expect(d.money.net).toBe(70000);
    expect(d.orders.byStatus.find((s) => s.status === 'paid')?.count).toBe(1);
    expect(d.stock.byStatus.find((s) => s.status === 'sold')?.count).toBe(1);
    expect(d.stock.byStatus.find((s) => s.status === 'in_stock')?.count).toBe(1);
  });

  it('scopes «today» to the current day and reports live cash and debt balances', async () => {
    const customer = await prisma.customer.create({ data: { phone: '+996700900004', name: 'Today' } });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total: 50000, status: 'paid' },
    });
    const shift = await prisma.cashShift.create({
      data: { staffId: 'staff-today', point: 'BISHKEK-1', openCash: 5000 },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 50000, method: 'cash', status: 'received', shiftId: shift.id },
    });
    // A payment from a previous day must NOT count towards «today».
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 900000,
        method: 'cash',
        status: 'received',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.debtPlan.create({
      data: {
        orderId: order.id,
        customerId: customer.id,
        principal: 40000,
        balance: 30000,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // already overdue
      },
    });

    const d = await reports.dashboard();
    // All-time still sees both payments; «today» sees only the recent one.
    expect(d.money.salesGross).toBe(950000);
    expect(d.today.salesGross).toBe(50000);
    // Drawer = opening float + cash taken on the open shift.
    expect(d.cash.inDrawers).toBe(55000);
    expect(d.cash.openShifts).toBe(1);
    expect(d.debts.openBalance).toBe(30000);
    expect(d.debts.overdue).toBe(1);
  });

  it('counts COD revenue recognised at delivery, which never becomes a Payment', async () => {
    const customer = await prisma.customer.create({ data: { phone: '+996700900005', name: 'COD' } });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', total: 70000, status: 'delivered' },
    });
    // A courier delivery posts Dr 1100 / Cr 4000 and creates no Payment row.
    await prisma.accountingJournalEntry.create({
      data: {
        idempotencyKey: `accounting:cod.receivable:${order.id}`,
        sourceType: 'cod.receivable',
        sourceRef: order.id,
        description: `COD к получению по заказу ${order.id}`,
        documentAmount: 70000,
        baseAmount: 70000,
        occurredAt: new Date(),
        createdBy: 'courier-1',
      },
    });
    // Plus an older COD delivery that must stay out of «today».
    await prisma.accountingJournalEntry.create({
      data: {
        idempotencyKey: `accounting:cod.receivable:old-${order.id}`,
        sourceType: 'cod.receivable',
        sourceRef: `old-${order.id}`,
        description: 'COD десятидневной давности',
        documentAmount: 500000,
        baseAmount: 500000,
        occurredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        createdBy: 'courier-1',
      },
    });

    const d = await reports.dashboard();
    expect(d.money.salesGross).toBe(570000); // no payments exist — this is pure COD
    expect(d.today.salesGross).toBe(70000);

    const buckets = await reports.revenue(7);
    expect(buckets.reduce((sum, b) => sum + b.amount, 0)).toBe(70000);
  });

  it('surfaces cash discrepancy, outstanding COD and stale reservation as risks', async () => {
    await prisma.cashShift.create({
      data: { staffId: 's1', point: 'B', openCash: 0, closeCash: -500, diff: -500, closedAt: new Date() },
    });
    await prisma.courierRun.create({ data: { courierId: 'c1', codTotal: 50000, handedOver: false } });
    await prisma.reservation.create({
      data: { orderId: 'o1', imei: 'x', expiresAt: new Date(Date.now() - 60_000), active: true },
    });

    const r = await reports.risks();
    const kinds = r.signals.map((s) => s.kind);
    expect(kinds).toContain('cash_discrepancy');
    expect(kinds).toContain('cod_outstanding');
    expect(kinds).toContain('stale_reservations');
    // high-severity signals rank first
    expect(r.signals[0].severity).toBe('high');
  });

  it('surfaces a buyback IMEI reused by a sold device as high risk', async () => {
    const customer = await prisma.customer.create({ data: { phone: '+996700900002', name: 'Reuse' } });
    const product = await prisma.product.create({
      data: { sku: 'RP-REUSE', name: 'Used iPhone', price: 100000, cost: 70000, category: 'phones', attrs: {} },
    });
    const imei = 'RP-REUSE-IMEI-1';
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'sold', location: 'BISHKEK-1', orderId: 'sold-order' },
    });
    await prisma.tradeInDevice.create({
      data: {
        customerId: customer.id,
        model: 'iPhone 13 Pro',
        imei,
        grade: 'B',
        price: 42000,
        sellerPassport: 'ID1234567',
        contractId: 'TI-RISK-1',
      },
    });

    const r = await reports.risks();
    const reuse = r.signals.find((signal) => signal.kind === 'imei_reuse');
    expect(reuse?.severity).toBe('high');
    expect(reuse?.ref).toBe(imei);
  });

  it('derives repeat returns, discount frequency and write-off growth from operational rows', async () => {
    const customer = await prisma.customer.create({
      data: { phone: '+996700900003', name: 'Мээрим' },
    });
    const product = await prisma.product.create({
      data: { sku: 'RP-ANOMALY', name: 'Risk phone', price: 100000, cost: 70000, category: 'phones', attrs: {} },
    });
    const shift = await prisma.cashShift.create({
      data: { staffId: 'staff-risk', point: 'BISHKEK-1', openCash: 0 },
    });

    for (let index = 0; index < 4; index += 1) {
      const order = await prisma.order.create({
        data: {
          customerId: customer.id,
          channel: 'pos',
          total: 90000,
          status: 'paid',
          items: { create: { sku: product.sku, qty: 1, price: 100000 } },
          payments: {
            create: { amount: 90000, method: 'cash', status: 'received', shiftId: shift.id },
          },
        },
      });
      await prisma.return.create({ data: { orderId: order.id, reason: `risk-${index}` } });
    }

    await prisma.inventoryMovement.createMany({
      data: [
        {
          productId: product.id,
          qty: -6,
          type: 'write_off',
          reason: 'current spike',
          // Keep this strictly behind ReportsService's captured clock. A database
          // default timestamp can be a few milliseconds ahead on busy full-suite runs.
          createdAt: new Date(Date.now() - 60_000),
        },
        {
          productId: product.id,
          qty: -2,
          type: 'write_off',
          reason: 'previous baseline',
          createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    const r = await reports.risks();
    expect(r.signals.find((signal) => signal.kind === 'repeat_returns')).toMatchObject({
      severity: 'high',
      ref: customer.id,
    });
    expect(r.signals.find((signal) => signal.kind === 'discount_frequency')).toMatchObject({
      severity: 'high',
      ref: 'staff-risk',
    });
    expect(r.signals.find((signal) => signal.kind === 'write_off_spike')).toMatchObject({
      severity: 'medium',
      ref: 'inventory',
    });
  });
});
