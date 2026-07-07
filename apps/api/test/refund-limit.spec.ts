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
      data: { orderId: order.id, amount: 100000, method: 'cash', status: 'received' },
    });

    const doRefund = (amount: number) =>
      prisma.$transaction((tx) =>
        ACTION_EXECUTORS.refund(
          tx,
          { paymentId: payment.id, amount },
          'admin-1',
          `appr-${amount}`,
          [],
        ),
      );

    await doRefund(100000); // first full refund — OK

    const err = await doRefund(100000).catch((e) => e); // second — over the limit
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('refund_exceeds_paid');

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
      data: { orderId: order.id, amount: 100000, method: 'cash', status: 'received' },
    });

    const doRefund = () =>
      prisma.$transaction((tx) =>
        ACTION_EXECUTORS.refund(
          tx,
          { paymentId: payment.id, amount: 100000 },
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
});
