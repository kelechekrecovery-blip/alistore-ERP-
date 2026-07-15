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
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
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
      payments.pay({ orderId: order.id, method: 'card', amount: 50000, txnId: 'race-payment-a' }, 'system'),
      payments.pay({ orderId: order.id, method: 'card', amount: 50000, txnId: 'race-payment-b' }, 'system'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1); // exactly one wins; the other hits payment_without_reservation

    const rows = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1); // no duplicate Payment row
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe('paid');
    const paidEvents = await prisma.auditEvent.findMany({ where: { type: 'order.paid' } });
    expect(paidEvents).toHaveLength(1); // order flipped to paid exactly once
  });
});
