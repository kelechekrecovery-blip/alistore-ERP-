import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UnitsService } from '../src/units/units.service';

/**
 * P0 M-1: concurrent full payments on an accessory-only order (no IMEI unit for
 * sellOnTx to lock) must not both succeed. A row lock on the order (FOR UPDATE)
 * serializes them; the loser re-reads status=paid and hits the payable guard.
 */
describe('Payments — concurrency (accessory order)', () => {
  let prisma: PrismaService;
  let payments: PaymentsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    payments = new PaymentsService(prisma, audit, new UnitsService(prisma), new ApprovalsService(prisma, audit));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany({ where: { imei: { startsWith: 'EXPIRED-PAYMENT' } } });
    await prisma.product.deleteMany({ where: { sku: { in: ['EXPIRED-PAYMENT', 'UNRESERVED-PAYMENT'] } } });
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  it('does not accept final payment after the reservation was released', async () => {
    const customer = await prisma.customer.create({ data: { phone: '+996701999999', name: 'Expired' } });
    const product = await prisma.product.create({
      data: { sku: 'EXPIRED-PAYMENT', name: 'Expired phone', price: 50000, cost: 40000, category: 'phones', attrs: {} },
    });
    const imei = 'EXPIRED-PAYMENT-IMEI';
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        total: 50000,
        status: 'reserved',
        items: { create: { sku: product.sku, qty: 1, price: 50000, imei } },
      },
    });
    await prisma.deviceUnit.create({ data: { imei, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' } });
    await prisma.reservation.create({
      data: { orderId: order.id, imei, active: false, expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(payments.pay(
      { orderId: order.id, method: 'card', amount: 50000, txnId: `expired-${order.id}` },
      'system',
    )).rejects.toMatchObject({ code: 'order_reservation_incomplete' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'reserved' });
  });

  it('does not accept final payment for a known serialized product with no reservation history', async () => {
    const customer = await prisma.customer.create({ data: { phone: '+996701999998', name: 'Unreserved' } });
    const product = await prisma.product.create({
      data: { sku: 'UNRESERVED-PAYMENT', name: 'Unreserved phone', price: 60000, cost: 45000, category: 'phones', attrs: {} },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        total: 60000,
        status: 'reserved',
        fulfillmentLocation: 'BISHKEK-1',
        items: { create: { sku: product.sku, qty: 1, price: 60000 } },
      },
    });

    await expect(payments.pay(
      { orderId: order.id, method: 'card', amount: 60000, txnId: `unreserved-${order.id}` },
      'system',
    )).rejects.toMatchObject({ code: 'order_reservation_incomplete' });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'reserved' });
  });

  /** A reserved, accessory-only order (no serialized unit) ready to pay. */
  async function accessoryOrder(total = 50000) {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+9967019${seq.toString().padStart(4, '0')}`, name: 'Acc' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', total, status: 'reserved' },
    });
    await prisma.orderItem.create({ data: { orderId: order.id, sku: `ACC-${seq}`, qty: 1, price: total } });
    return order;
  }

  it('does not double-pay under two concurrent full payments', async () => {
    const order = await accessoryOrder(50000);
    await prisma.order.update({ where: { id: order.id }, data: { fulfillmentLocation: 'BISHKEK-1' } });
    // Two full card payments fired together with distinct provider ids: only one may complete.
    const results = await Promise.allSettled([
      payments.pay({ orderId: order.id, method: 'card', amount: 50000, txnId: `race-payment-a-${order.id}` }, 'system'),
      payments.pay({ orderId: order.id, method: 'card', amount: 50000, txnId: `race-payment-b-${order.id}` }, 'system'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    if (ok.length !== 1) {
      throw new Error(`Expected one payment winner: ${results.map((result) => result.status === 'rejected' ? `${result.reason?.code ?? result.reason?.name}: ${result.reason?.message}` : 'fulfilled').join(' | ')}`);
    }
    expect(ok).toHaveLength(1); // exactly one wins; the other hits payment_without_reservation

    const rows = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1); // no duplicate Payment row
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe('paid');
    const paidEvents = await prisma.auditEvent.findMany({ where: { type: 'order.paid' } });
    expect(paidEvents).toHaveLength(1); // order flipped to paid exactly once
  });
});
