import { PrismaService } from '../src/prisma/prisma.service';
import { ACTION_EXECUTORS } from '../src/approvals/action-executors';
import { ValidationError } from '../src/common/errors';

/**
 * P0 (invariant #1): total refunds must not exceed what was paid. A single refund
 * was capped at the original payment, but two 100k refunds against a 100k order
 * both passed — the cumulative check now blocks the second.
 */
describe('Refund cumulative limit (invariant #1)', () => {
  let prisma: PrismaService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a second refund that would exceed the amount paid', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}`, name: 'Возврат Клиент' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total: 100000, status: 'paid' },
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'card', status: 'received' },
    });

    const doRefund = (amount: number) =>
      prisma.$transaction((tx) =>
        ACTION_EXECUTORS.refund(
          tx,
          { paymentId: payment.id, amount, externalReference: `refund-limit-${amount}` },
          'admin-1',
          `appr-${amount}`,
          [],
        ),
      );

    await doRefund(100000); // first full refund — OK

    const err = await doRefund(100000).catch((e) => e); // second — over the limit
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('refund_exceeds_tender');

    // Net paid for the order is exactly zero (100k in, 100k refunded) — not -100k.
    const agg = await prisma.payment.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    });
    expect(agg._sum.amount).toBe(0);
  });

  it('two concurrent refunds on one order → exactly one succeeds (row lock)', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+9967${RUN}1`, name: 'Гонка Возврат' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total: 100000, status: 'paid' },
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'card', status: 'received' },
    });

    const doRefund = () =>
      prisma.$transaction((tx) =>
        ACTION_EXECUTORS.refund(
          tx,
          { paymentId: payment.id, amount: 100000, externalReference: 'refund-race-provider' },
          'admin-1',
          'appr-race',
          [],
        ),
      );

    const results = await Promise.allSettled([doRefund(), doRefund()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // Exactly one refund landed: net paid is zero, not negative.
    const agg = await prisma.payment.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    });
    expect(agg._sum.amount).toBe(0);
  });

  it('caps service refunds by original tender and preserves refund provenance', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+9968${RUN}2`, name: 'Возврат ремонта' },
    });
    const warrantyCase = await prisma.warrantyCase.create({
      data: {
        imei: `REFUND-SERVICE-${RUN}`,
        customerId: customer.id,
        problem: 'Платный ремонт',
        serviceType: 'paid',
        deviceName: 'iPhone 15',
        status: 'approved',
        sla: new Date(Date.now() + 86_400_000),
      },
    });
    const workOrder = await prisma.serviceWorkOrder.create({
      data: {
        warrantyCaseId: warrantyCase.id,
        createdBy: 'owner-1',
        point: 'BISHKEK-1',
        estimateAmount: 6500,
        estimatePreparedAt: new Date(),
        estimateApprovedAt: new Date(),
      },
    });
    const cash = await prisma.payment.create({
      data: { serviceWorkOrderId: workOrder.id, amount: 2500, method: 'card', status: 'received' },
    });
    await prisma.payment.create({
      data: { serviceWorkOrderId: workOrder.id, amount: 4000, method: 'card', status: 'received' },
    });
    const events: Parameters<typeof ACTION_EXECUTORS.refund>[4] = [];
    const refundCash = (amount: number) => prisma.$transaction((tx) =>
      ACTION_EXECUTORS.refund(tx, { paymentId: cash.id, amount, externalReference: `service-refund-provider-${amount}` }, 'owner-1', `service-refund-${amount}`, events),
    );

    await refundCash(2000);
    const err = await refundCash(600).catch((error) => error);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('refund_exceeds_tender');
    await refundCash(500);

    const cashRefunds = await prisma.payment.findMany({
      where: { originalPaymentId: cash.id },
      orderBy: { amount: 'asc' },
    });
    expect(cashRefunds.map(({ amount, method, serviceWorkOrderId, originalPaymentId }) => ({ amount, method, serviceWorkOrderId, originalPaymentId }))).toEqual([
      { amount: -2000, method: 'card', serviceWorkOrderId: workOrder.id, originalPaymentId: cash.id },
      { amount: -500, method: 'card', serviceWorkOrderId: workOrder.id, originalPaymentId: cash.id },
    ]);
    const net = await prisma.payment.aggregate({ where: { serviceWorkOrderId: workOrder.id }, _sum: { amount: true } });
    expect(net._sum.amount).toBe(4000);
    expect(events.filter((event) => event.type === 'payment.refunded')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'accounting.entry_posted')).toHaveLength(2);
  });
});
