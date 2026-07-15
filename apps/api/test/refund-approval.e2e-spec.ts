import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError, ForbiddenError, ValidationError } from '../src/common/errors';

/**
 * Approval-gated refund (Approval Rules Matrix + invariant #1):
 *  - a refund is parked as an approval, not executed (no money moves yet);
 *  - approving it creates the compensating negative payment and refunds the order;
 *  - rejecting it moves no money; a second decision is blocked (409);
 *  - a refund needs an existing payment and amount ≤ paid.
 */
describe('Refund approval cycle (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let approvals: ApprovalsService;
  let units: UnitsService;
  let seq = 0;
  const run = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    units = new UnitsService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, approvals);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function paidOrder() {
    seq += 1;
    const s = seq.toString().padStart(3, '0');
    const customer = await prisma.customer.create({ data: { phone: `+9967006${s}`, name: 'T' } });
    const product = await prisma.product.create({
      data: { sku: `RF-${s}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    const imei = `IMEI-RF-${s}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });
    const order = await orders.create(
      { customerId: customer.id, channel: 'pos', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000, imei }] },
      'seller',
    );
    await orders.reserve(order.id, 'seller');
    const paid = await payments.pay({ orderId: order.id, method: 'card', amount: 100000, txnId: `refund-payment-${run}-${seq}` }, 'cashier');
    return { orderId: order.id, paymentId: paid.payment.id };
  }

  it('parks a refund as an approval without moving money, then executes on approve', async () => {
    const { orderId, paymentId } = await paidOrder();

    const req = await payments.refund(paymentId, 100000, 'брак', 'senior_azamat', undefined, { externalReference: 'provider-refund-1' });
    expect(req.approvalId).toBeDefined();
    expect(req.status).toBe('requested');

    // nothing refunded yet
    expect(await prisma.payment.count({ where: { amount: { lt: 0 } } })).toBe(0);
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe('paid');

    // approve → compensating negative payment + order refunded
    await approvals.decide(req.approvalId, { status: 'approved', approver: 'admin_gulnara', approverRole: 'admin' });

    const refunds = await prisma.payment.findMany({ where: { amount: { lt: 0 } } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(-100000);
    expect(refunds[0].status).toBe('refunded');
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe('refunded');
    const taxEntries = await prisma.accountingJournalEntry.findMany({
      where: { sourceRef: { in: [paymentId, refunds[0].id] } },
      include: { lines: true },
      orderBy: { sourceType: 'asc' },
    });
    expect(taxEntries).toHaveLength(2);
    expect(taxEntries.map((entry) => entry.taxAmount)).toEqual([10_714, 10_714]);
    const outputTaxLines = taxEntries.flatMap((entry) => entry.lines).filter((line) => line.accountCode === '2200');
    expect(outputTaxLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ debit: 10_714, credit: 0 }),
      expect.objectContaining({ debit: 0, credit: 10_714 }),
    ]));

    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['approval.requested', 'approval.approved', 'payment.refunded', 'order.refunded']),
    );
  });

  it('moves no money when the refund is rejected, and blocks a second decision', async () => {
    const { paymentId } = await paidOrder();
    const req = await payments.refund(paymentId, 50000, 'спорно', 'senior_azamat', undefined, { externalReference: 'provider-refund-2' });

    await approvals.decide(req.approvalId, { status: 'rejected', approver: 'admin_gulnara', approverRole: 'admin' });
    expect(await prisma.payment.count({ where: { amount: { lt: 0 } } })).toBe(0);

    const again = await approvals
      .decide(req.approvalId, { status: 'approved', approver: 'admin_gulnara', approverRole: 'admin' })
      .catch((e) => e);
    expect(again).toBeInstanceOf(ConflictError);
    expect(again.code).toBe('approval_already_decided');
  });

  it('rejects an approval decision by an unauthorized role (403)', async () => {
    const { paymentId } = await paidOrder();
    const req = await payments.refund(paymentId, 10000, 'спорно', 'seller_bob', undefined, { externalReference: 'provider-refund-3' });
    const err = await approvals
      .decide(req.approvalId, { status: 'approved', approver: 'seller_bob', approverRole: 'seller' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.getStatus()).toBe(403);
    expect(err.code).toBe('approver_not_authorized');
    // still pending, no money moved
    expect(await prisma.payment.count({ where: { amount: { lt: 0 } } })).toBe(0);
  });

  it('enforces invariant #1: refund needs a payment and amount ≤ paid', async () => {
    const missing = await payments.refund('nope', 1000, 'x', 'a').catch((e) => e);
    expect(missing).toBeInstanceOf(ValidationError);
    expect(missing.code).toBe('payment_not_found');

    const { paymentId } = await paidOrder();
    const tooMuch = await payments.refund(paymentId, 200000, 'x', 'a').catch((e) => e);
    expect(tooMuch).toBeInstanceOf(ValidationError);
    expect(tooMuch.code).toBe('invalid_refund_amount');
  });
});
