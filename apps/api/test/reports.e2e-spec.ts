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
