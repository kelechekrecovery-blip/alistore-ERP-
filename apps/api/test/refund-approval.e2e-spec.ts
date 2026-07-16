import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError, ForbiddenError, ValidationError } from '../src/common/errors';
import { RefundsService } from '../src/refunds/refunds.service';
import { RefundProcessor } from '../src/refunds/refunds.processor';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import { clearGiftCardTransactions } from './db-test-cleanup';

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
  let refundsService: RefundsService;
  let refundProcessor: RefundProcessor;
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
    refundsService = new RefundsService(prisma, audit);
    refundProcessor = new RefundProcessor(prisma, audit, new SandboxPaymentGatewayProvider());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearGiftCardTransactions(prisma);
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany({ where: { staffId: 'cashier' } });
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

  async function splitPaidOrder() {
    seq += 1;
    const s = seq.toString().padStart(3, '0');
    const customer = await prisma.customer.create({ data: { phone: `+9967016${s}`, name: 'Split refund' } });
    const product = await prisma.product.create({
      data: { sku: `RF-SPLIT-${s}`, name: 'Split iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    const imei = `IMEI-RF-SPLIT-${s}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });
    const order = await orders.create(
      { customerId: customer.id, channel: 'pos', total: 100000, items: [{ sku: product.sku, qty: 1, price: 100000, imei }] },
      'seller',
    );
    await orders.reserve(order.id, 'seller');
    const shift = await prisma.cashShift.create({ data: { staffId: 'cashier', point: 'BISHKEK-1', openCash: 0 } });
    const paid = await payments.payMany({
      orderId: order.id,
      shiftId: shift.id,
      payments: [
        { method: 'cash', amount: 40000, idempotencyKey: `split-cash-${run}-${seq}` },
        { method: 'card', amount: 60000, txnId: `split-card-${run}-${seq}`, idempotencyKey: `split-card-${run}-${seq}` },
      ],
    }, 'cashier', { staffId: 'cashier' });
    return { order, shift, cash: paid.payments[0], card: paid.payments[1] };
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

  it('restores legacy gift-card value and records immutable provenance', async () => {
    const { orderId, paymentId } = await paidOrder();
    const card = await prisma.giftCard.create({
      data: {
        code: `LEGACY-${run}-${seq}`,
        initialBalance: 100000,
        balance: 100000,
        status: 'active',
        issuedBy: 'test',
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { method: 'gift_card', giftCardId: card.id, accountCode: '2300' },
      });
      await tx.giftCard.update({
        where: { id: card.id },
        data: { balance: 0, status: 'redeemed' },
      });
      await tx.giftCardTransaction.create({
        data: {
          giftCardId: card.id,
          paymentId,
          type: 'redemption',
          amount: -100000,
          balanceAfter: 0,
          sourceRef: `legacy-gift-card-redemption:${paymentId}`,
          actor: 'test',
        },
      });
    });
    const req = await payments.refund(paymentId, 100000, 'legacy gift card', 'senior_azamat');

    await approvals.decide(req.approvalId, {
      status: 'approved', approver: 'admin_gulnara', approverRole: 'admin',
    });

    expect(await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } }))
      .toMatchObject({ balance: 100000, status: 'active' });
    const compensating = await prisma.payment.findFirstOrThrow({
      where: { orderId, originalPaymentId: paymentId, amount: -100000 },
    });
    expect(compensating.giftCardId).toBe(card.id);
    expect(await prisma.giftCardTransaction.findUniqueOrThrow({ where: { paymentId: compensating.id } }))
      .toMatchObject({ giftCardId: card.id, type: 'refund', amount: 100000, balanceAfter: 100000 });
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

  it('refunds one split-tender order back to cash and card in one approval', async () => {
    const fixture = await splitPaidOrder();
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: fixture.order.id } });
    const ret = await prisma.return.create({
      data: {
        orderId: fixture.order.id,
        reason: 'split tender return',
        status: 'processing',
        refundAmount: 100000,
        isFullOrder: true,
        items: { create: { orderItemId: orderItem.id, qty: 1, refundAmount: 100000 } },
      },
    });
    const requested = await refundsService.request(
      ret.id,
      { reason: 'полный возврат split tender', shiftId: fixture.shift.id },
      'cashier',
      `split-refund-${run}-${seq}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved',
      approver: 'admin_gulnara',
      approverRole: 'admin',
    });
    await refundProcessor.processRefund(requested!.id, 'system:test');

    const refunds = await prisma.payment.findMany({
      where: { orderId: fixture.order.id, amount: { lt: 0 } },
      orderBy: { amount: 'desc' },
    });
    expect(refunds).toHaveLength(2);
    expect(refunds).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalPaymentId: fixture.cash.id, amount: -40000, method: 'cash', shiftId: fixture.shift.id, accountCode: '1000' }),
      expect.objectContaining({ originalPaymentId: fixture.card.id, amount: -60000, method: 'card', shiftId: null, accountCode: '1020' }),
    ]));
    expect(await prisma.payment.aggregate({ where: { orderId: fixture.order.id }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 0 } });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).toMatchObject({ status: 'refunded' });
    const paidReturn = await prisma.return.findUniqueOrThrow({ where: { id: ret.id } });
    expect(paidReturn.status).toBe('paid');
    expect(paidReturn.refundId).toBeNull();

    const entries = await prisma.accountingJournalEntry.findMany({
      where: { sourceType: 'payment.refund', sourceRef: { in: refunds.map((refund) => refund.id) } },
      include: { lines: true },
    });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, entry) => sum + entry.taxAmount, 0)).toBe(fixture.order.taxAmount);
    const fundingCredits = entries.flatMap((entry) => entry.lines).filter((line) => ['1000', '1020'].includes(line.accountCode));
    expect(fundingCredits).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1000', credit: 40000 }),
      expect.objectContaining({ accountCode: '1020', credit: 60000 }),
    ]));
    expect(await prisma.auditEvent.count({ where: { type: 'payment.refunded', refs: { has: fixture.order.id } } })).toBe(2);
    const refundSucceeded = await prisma.auditEvent.findFirstOrThrow({ where: { type: 'refund.succeeded', refs: { has: ret.id } } });
    expect(refundSucceeded.payload).toMatchObject({ refundId: requested!.id, returnId: ret.id, amount: 100000 });
  });

  it('keeps cumulative tax exact when an aggregate refund follows a legacy partial refund', async () => {
    seq += 1;
    const suffix = `tax-${run}-${seq}`;
    const customer = await prisma.customer.create({
      data: { phone: `+996702${String(run).slice(-3)}${String(seq).padStart(3, '0')}`, name: 'Tax bridge' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        status: 'paid',
        total: 100000,
        taxBaseAmount: 89286,
        taxAmount: 10714,
        items: {
          create: {
            sku: `RF-TAX-${suffix}`,
            qty: 2,
            price: 50000,
            taxCode: 'vat_standard',
            taxRateBps: 1200,
            taxBaseAmount: 89286,
            taxAmount: 10714,
          },
        },
      },
      include: { items: true },
    });
    const original = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 100000,
        method: 'card',
        status: 'received',
        txnId: `tax-source-${suffix}`,
      },
    });
    const legacyReturn = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'legacy first half',
        status: 'processing',
        refundAmount: 50000,
        isFullOrder: false,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 50000 } },
      },
    });
    const legacyApproval = await payments.refund(
      original.id,
      50000,
      'legacy first half',
      'senior_azamat',
      legacyReturn.id,
      { externalReference: `legacy-tax-${suffix}` },
    );
    await approvals.decide(legacyApproval.approvalId, {
      status: 'approved', approver: 'admin_gulnara', approverRole: 'admin',
    });

    const aggregateReturn = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'aggregate second half',
        status: 'processing',
        refundAmount: 50000,
        isFullOrder: false,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 50000 } },
      },
    });
    const aggregate = await refundsService.request(
      aggregateReturn.id,
      { reason: 'aggregate second half' },
      'senior_azamat',
      `aggregate-tax-${suffix}`,
    );
    await approvals.decide(aggregate!.approvalId!, {
      status: 'approved', approver: 'admin_gulnara', approverRole: 'admin',
    });
    await refundProcessor.processRefund(aggregate!.id, 'system:test');

    const refundPayments = await prisma.payment.findMany({
      where: { orderId: order.id, amount: { lt: 0 } },
      select: { id: true },
    });
    expect(refundPayments).toHaveLength(2);
    expect(await prisma.accountingJournalEntry.aggregate({
      where: { sourceType: 'payment.refund', sourceRef: { in: refundPayments.map(({ id }) => id) } },
      _sum: { taxAmount: true },
    })).toMatchObject({ _sum: { taxAmount: order.taxAmount } });
    expect((await refundsService.get(aggregate!.id))?.lines).toEqual([
      expect.objectContaining({ grossAmount: 50000, taxAmount: 5357, taxBaseAmount: 44643 }),
    ]);
  });

  it('caps mixed-tax aggregate reversal by tax already posted by a legacy refund', async () => {
    seq += 1;
    const suffix = `mixed-tax-${run}-${seq}`;
    const customer = await prisma.customer.create({
      data: { phone: `+996703${String(run).slice(-3)}${String(seq).padStart(3, '0')}`, name: 'Mixed tax bridge' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        status: 'paid',
        total: 100000,
        taxBaseAmount: 94643,
        taxAmount: 5357,
        items: {
          create: [
            {
              sku: `RF-TAXABLE-${suffix}`,
              qty: 1,
              price: 50000,
              taxCode: 'vat_standard',
              taxRateBps: 1200,
              taxBaseAmount: 44643,
              taxAmount: 5357,
            },
            {
              sku: `RF-EXEMPT-${suffix}`,
              qty: 1,
              price: 50000,
              taxCode: 'exempt',
              taxRateBps: 0,
              taxBaseAmount: 50000,
              taxAmount: 0,
            },
          ],
        },
      },
      include: { items: true },
    });
    const taxable = order.items.find((item) => item.taxAmount > 0)!;
    const exempt = order.items.find((item) => item.taxAmount === 0)!;
    const original = await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'card', status: 'received', txnId: `mixed-tax-source-${suffix}` },
    });
    const legacyReturn = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'legacy exempt line first',
        status: 'processing',
        refundAmount: 50000,
        items: { create: { orderItemId: exempt.id, qty: 1, refundAmount: 50000 } },
      },
    });
    const legacyApproval = await payments.refund(
      original.id,
      50000,
      'legacy exempt line first',
      'senior_azamat',
      legacyReturn.id,
      { externalReference: `legacy-mixed-tax-${suffix}` },
    );
    await approvals.decide(legacyApproval.approvalId, {
      status: 'approved', approver: 'admin_gulnara', approverRole: 'admin',
    });

    const aggregateReturn = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'aggregate taxable line second',
        status: 'processing',
        refundAmount: 50000,
        items: { create: { orderItemId: taxable.id, qty: 1, refundAmount: 50000 } },
      },
    });
    const aggregate = await refundsService.request(
      aggregateReturn.id,
      { reason: 'aggregate taxable line second' },
      'senior_azamat',
      `aggregate-mixed-tax-${suffix}`,
    );
    await approvals.decide(aggregate!.approvalId!, {
      status: 'approved', approver: 'admin_gulnara', approverRole: 'admin',
    });
    await refundProcessor.processRefund(aggregate!.id, 'system:test');

    const refundPayments = await prisma.payment.findMany({
      where: { orderId: order.id, amount: { lt: 0 } },
      select: { id: true },
    });
    expect(await prisma.accountingJournalEntry.aggregate({
      where: { sourceType: 'payment.refund', sourceRef: { in: refundPayments.map(({ id }) => id) } },
      _sum: { taxAmount: true },
    })).toMatchObject({ _sum: { taxAmount: order.taxAmount } });
    expect((await refundsService.get(aggregate!.id))?.lines).toEqual([
      expect.objectContaining({ grossAmount: 50000, taxAmount: 2679, taxBaseAmount: 47321 }),
    ]);
  });

  it('allows only one of two concurrent split-refund approvals to move money', async () => {
    const fixture = await splitPaidOrder();
    const requestRefund = (suffix: string) => payments.refund(
      fixture.cash.id,
      100000,
      `concurrent split refund ${suffix}`,
      'cashier',
      undefined,
      {
        allocations: [
          { paymentId: fixture.cash.id, amount: 40000, shiftId: fixture.shift.id },
          { paymentId: fixture.card.id, amount: 60000, externalReference: `split-race-${suffix}-${run}-${seq}` },
        ],
      },
    );
    const [first, second] = await Promise.all([requestRefund('a'), requestRefund('b')]);
    const decisions = await Promise.allSettled([
      approvals.decide(first.approvalId, { status: 'approved', approver: 'admin-a', approverRole: 'admin' }),
      approvals.decide(second.approvalId, { status: 'approved', approver: 'admin-b', approverRole: 'admin' }),
    ]);
    expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((decision) => decision.status === 'rejected')).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: fixture.order.id, amount: { lt: 0 } } })).toBe(2);
    expect(await prisma.payment.aggregate({ where: { orderId: fixture.order.id }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 0 } });
    expect(await prisma.approval.count({ where: { status: 'approved' } })).toBe(1);
    expect(await prisma.approval.count({ where: { status: 'requested' } })).toBe(1);
  });
});
