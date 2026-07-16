import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ForbiddenError } from '../src/common/errors';
import { RefundProcessor } from '../src/refunds/refunds.processor';
import { RefundsService } from '../src/refunds/refunds.service';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import type { GatewayRefundInput, PaymentGatewayProvider } from '../src/payments/payment-gateway-provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { clearGiftCardTransactions } from './db-test-cleanup';

describe('Refund aggregate FIN-003E (integration)', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let refunds: RefundsService;
  let processor: RefundProcessor;
  let shifts: ShiftsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    refunds = new RefundsService(prisma, audit);
    processor = new RefundProcessor(prisma, audit, new SandboxPaymentGatewayProvider());
    shifts = new ShiftsService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearGiftCardTransactions(prisma);
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function fixture() {
    const suffix = Math.random().toString(36).slice(2, 10);
    const customer = await prisma.customer.create({ data: { phone: `+99655${suffix}`, name: 'Refund aggregate' } });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        status: 'paid',
        total: 100_000,
        taxBaseAmount: 89_286,
        taxAmount: 10_714,
        items: {
          create: {
            sku: `REF-${suffix}`,
            qty: 1,
            price: 100_000,
            taxCode: 'vat_standard',
            taxRateBps: 1200,
            taxBaseAmount: 89_286,
            taxAmount: 10_714,
          },
        },
      },
      include: { items: true },
    });
    const card = await prisma.payment.create({
      data: { orderId: order.id, amount: 60_000, method: 'card', status: 'received', txnId: `card-${suffix}`, point: 'BISHKEK-1' },
    });
    const cash = await prisma.payment.create({
      data: { orderId: order.id, amount: 40_000, method: 'cash', status: 'received', point: 'BISHKEK-1' },
    });
    const shift = await prisma.cashShift.create({ data: { staffId: 'cashier-1', point: 'BISHKEK-1', openCash: 50_000 } });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'mixed tender return',
        status: 'processing',
        refundAmount: 100_000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 100_000 } },
      },
    });
    return { order, card, cash, shift, ret };
  }

  it('allocates server-side, enforces four-eyes, executes once, and exposes drilldown', async () => {
    const f = await fixture();
    const key = `refund-request-${f.ret.id}`;
    const [requested, replay] = await Promise.all([
      refunds.request(f.ret.id, { reason: 'товар возвращён', shiftId: f.shift.id }, 'cashier-1', key),
      refunds.request(f.ret.id, { reason: 'товар возвращён', shiftId: f.shift.id }, 'cashier-1', key),
    ]);
    expect(replay?.id).toBe(requested?.id);
    expect(requested?.allocations).toEqual([
      expect.objectContaining({ originalPaymentId: f.card.id, amount: 60_000, ordinal: 0, methodSnapshot: 'card' }),
      expect.objectContaining({ originalPaymentId: f.cash.id, amount: 40_000, ordinal: 1, methodSnapshot: 'cash', shiftId: f.shift.id }),
    ]);

    const selfApproval = await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'cashier-1', approverRole: 'admin',
    }).catch((error) => error);
    expect(selfApproval).toBeInstanceOf(ForbiddenError);

    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    expect((await refunds.get(requested!.id))?.status).toBe('approved');

    await Promise.all([
      processor.processRefund(requested!.id, 'system:test-a'),
      processor.processRefund(requested!.id, 'system:test-b'),
    ]);
    await processor.processRefund(requested!.id, 'system:test');

    const completed = await refunds.get(requested!.id);
    expect(completed).toMatchObject({ status: 'succeeded', amount: 100_000, approver: 'admin-2' });
    expect(completed?.lines).toEqual([
      expect.objectContaining({ grossAmount: 100_000, taxBaseAmount: 89_286, taxAmount: 10_714, revenueAmount: 89_286 }),
    ]);
    expect(completed?.allocations.map((item) => item.status)).toEqual(['succeeded', 'succeeded']);
    const refundPayments = await prisma.payment.findMany({ where: { orderId: f.order.id, amount: { lt: 0 } } });
    expect(refundPayments).toHaveLength(2);
    expect(refundPayments.map((payment) => payment.receivedBy)).toEqual(['cashier-1', 'cashier-1']);
    expect(await prisma.accountingJournalEntry.aggregate({
      where: { sourceType: 'payment.refund', sourceRef: { in: refundPayments.map((payment) => payment.id) } },
      _sum: { taxAmount: true },
    })).toMatchObject({ _sum: { taxAmount: 10_714 } });
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('paid');
    expect(await prisma.auditEvent.count({ where: { type: 'refund.succeeded', refs: { has: requested!.id } } })).toBe(1);
  });

  it('keeps accepted provider allocations pending without posting money or accounting', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'асинхронный provider', shiftId: f.shift.id },
      'cashier-1',
      `accepted-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    const providerRefundId = `pending-refund-${f.ret.id}`;
    let providerAttempts = 0;
    const providerRefund = jest.fn(async (_input: GatewayRefundInput) => {
      providerAttempts += 1;
      return {
        providerRefundId,
        status: providerAttempts === 1 ? 'accepted' as const : 'succeeded' as const,
      };
    });
    const acceptedGateway: PaymentGatewayProvider = {
      name: 'sandbox',
      assertOperational() {},
      createIntent: () => Promise.reject(new Error('not used')),
      verifyWebhook: () => Promise.reject(new Error('not used')),
      verifyRefundWebhook: (input) => Promise.resolve(input.payload as never),
      refund: providerRefund,
    };
    const acceptedProcessor = new RefundProcessor(prisma, new AuditService(prisma), acceptedGateway);

    await acceptedProcessor.processRefund(requested!.id, 'system:accepted');

    const pending = await refunds.get(requested!.id);
    const card = pending?.allocations.find((allocation) => allocation.methodSnapshot === 'card');
    const cash = pending?.allocations.find((allocation) => allocation.methodSnapshot === 'cash');
    expect(pending?.status).toBe('processing');
    expect(card).toMatchObject({ status: 'provider_pending', providerRefundId, refundPaymentId: null });
    expect(cash).toMatchObject({ status: 'queued', refundPaymentId: null });
    expect(providerRefund).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count({ where: { originalPaymentId: f.card.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { originalPaymentId: f.cash.id } })).toBe(0);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'payment.refund', sourceRef: { contains: f.card.id } } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.provider_pending', refs: { has: requested!.id } } })).toBe(1);

    const finalizeSpy = jest.spyOn(acceptedProcessor as any, 'finalize')
      .mockRejectedValueOnce(new Error('simulated accounting outage'));
    await expect(acceptedProcessor.reconcileProviderRefund({
      providerRefundId,
      status: 'succeeded',
      providerReference: 'provider-statement-1',
    }, 'system:provider-confirmed')).rejects.toThrow('simulated accounting outage');
    finalizeSpy.mockRestore();
    expect((await refunds.get(requested!.id))?.allocations.find(
      (allocation) => allocation.methodSnapshot === 'card',
    )?.status).toBe('provider_pending');
    expect(await prisma.payment.count({ where: { originalPaymentId: f.card.id } })).toBe(0);

    const secondReturn = await prisma.return.create({
      data: {
        orderId: f.order.id,
        reason: 'must not reuse pending provider capacity',
        status: 'processing',
        refundAmount: 1,
        items: { create: { orderItemId: f.order.items[0].id, qty: 1, refundAmount: 1 } },
      },
    });
    await expect(refunds.request(
      secondReturn.id,
      { reason: 'повторная аллокация', shiftId: f.shift.id },
      'cashier-1',
      `second-${f.ret.id}`,
    )).rejects.toMatchObject({ code: 'refund_exceeds_paid' });

    await expect(shifts.close(f.shift.id, { closeCash: 50_000 }, 'cashier-1'))
      .rejects.toMatchObject({ code: 'shift_has_pending_refunds' });

    await acceptedProcessor.reconcileProviderRefund({
      providerRefundId,
      status: 'succeeded',
      providerReference: 'provider-statement-1',
    }, 'system:provider-confirmed');
    await acceptedProcessor.reconcileProviderRefund({
      providerRefundId,
      status: 'succeeded',
      providerReference: 'provider-statement-1',
    }, 'system:provider-confirmed-replay');
    const succeeded = await refunds.get(requested!.id);
    expect(succeeded?.status).toBe('succeeded');
    expect(succeeded?.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodSnapshot: 'card', status: 'succeeded', providerRefundId }),
      expect.objectContaining({ methodSnapshot: 'cash', status: 'succeeded' }),
    ]));
    expect(providerRefund).toHaveBeenCalledTimes(1);
    expect(providerRefund.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      `refund:${card!.id}`,
    ]);
    const providerSuccessEvents = await prisma.auditEvent.findMany({
      where: { type: 'refund.provider_succeeded', refs: { has: card!.id } },
    });
    expect(providerSuccessEvents).toHaveLength(1);
    expect(providerSuccessEvents[0].payload).toMatchObject({
      providerRefundId,
      providerReference: 'provider-statement-1',
    });
    expect(await prisma.payment.count({ where: { orderId: f.order.id, amount: { lt: 0 } } })).toBe(2);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'payment.refund', sourceRef: { in: succeeded!.allocations.map((allocation) => allocation.refundPaymentId!) } },
    })).toBe(2);
  });

  it('restores gift-card balance atomically with aggregate allocation provenance', async () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const customer = await prisma.customer.create({ data: { phone: `+99677${suffix}`, name: 'Gift refund' } });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        status: 'paid',
        total: 100_000,
        taxBaseAmount: 89_286,
        taxAmount: 10_714,
        items: { create: {
          sku: `GIFT-REF-${suffix}`,
          qty: 1,
          price: 100_000,
          taxCode: 'vat_standard',
          taxRateBps: 1200,
          taxBaseAmount: 89_286,
          taxAmount: 10_714,
        } },
      },
      include: { items: true },
    });
    const card = await prisma.giftCard.create({
      data: {
        code: `GIFT-REF-${suffix}`,
        initialBalance: 150_000,
        balance: 150_000,
        status: 'active',
        issuedBy: 'admin-2',
      },
    });
    const tender = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: 100_000,
          method: 'gift_card',
          status: 'received',
          giftCardId: card.id,
          idempotencyKey: `gift-tender-${suffix}`,
          txnId: `giftcard:${card.code}:${order.id}`,
          receivedBy: 'cashier-1',
          point: 'BISHKEK-1',
        },
      });
      await tx.giftCard.update({ where: { id: card.id }, data: { balance: 50_000 } });
      await tx.giftCardTransaction.create({
        data: {
          giftCardId: card.id,
          paymentId: payment.id,
          type: 'redemption',
          amount: -100_000,
          balanceAfter: 50_000,
          sourceRef: `gift-tender-${suffix}`,
          actor: 'cashier-1',
        },
      });
      return payment;
    });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'gift-card refund',
        status: 'processing',
        refundAmount: 100_000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 100_000 } },
      },
    });
    const requested = await refunds.request(
      ret.id,
      { reason: 'restore gift card' },
      'cashier-1',
      `gift-refund-${suffix}`,
    );
    expect(requested?.allocations).toEqual([
      expect.objectContaining({ originalPaymentId: tender.id, methodSnapshot: 'gift_card', amount: 100_000 }),
    ]);
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    await processor.processRefund(requested!.id, 'system:gift-refund');
    await processor.processRefund(requested!.id, 'system:gift-refund-replay');

    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance).toBe(150_000);
    const journal = await prisma.giftCardTransaction.findMany({
      where: { giftCardId: card.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(journal).toHaveLength(2);
    expect(journal.map((entry) => [entry.type, entry.amount, entry.balanceAfter])).toEqual([
      ['redemption', -100_000, 50_000],
      ['refund', 100_000, 150_000],
    ]);
    expect(journal[1].refundAllocationId).toBe(requested!.allocations[0].id);
  });

  it('prevents a legacy payment from stealing reserved tender capacity', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'capacity race', shiftId: f.shift.id },
      'cashier-1',
      `capacity-race-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    await expect(prisma.payment.create({
      data: {
        orderId: f.order.id,
        originalPaymentId: f.card.id,
        amount: -f.card.amount,
        method: f.card.method,
        status: 'refunded',
        txnId: `legacy-race-${f.card.id}`,
      },
    })).rejects.toThrow(/refunds exceed original payment/);
    expect(await prisma.payment.count({ where: { txnId: `legacy-race-${f.card.id}` } })).toBe(0);
  });

  it('rejects the linked Return without moving money so a new return request remains possible', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'отклоняемая заявка', shiftId: f.shift.id },
      'cashier-1',
      `rejected-${f.ret.id}`,
    );

    await approvals.decide(requested!.approvalId!, {
      status: 'rejected', approver: 'admin-2', approverRole: 'admin', reason: 'Нет подтверждения товара',
    });

    expect((await refunds.get(requested!.id))?.status).toBe('rejected');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('rejected');
    expect(await prisma.payment.count({ where: { orderId: f.order.id, amount: { lt: 0 } } })).toBe(0);
  });

  it('blocks closing a shift while its cash refund is pending', async () => {
    const f = await fixture();
    await refunds.request(
      f.ret.id,
      { reason: 'pending cash before close', shiftId: f.shift.id },
      'cashier-1',
      `pending-close-${f.ret.id}`,
    );

    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash }, 'cashier-1'))
      .rejects.toMatchObject({ code: 'shift_has_pending_refunds' });
    expect((await prisma.cashShift.findUniqueOrThrow({ where: { id: f.shift.id } })).closedAt).toBeNull();
  });

  it('rejects inconsistent aggregate writes at the database boundary', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'database invariant', shiftId: f.shift.id },
      'cashier-1',
      `db-invariant-${f.ret.id}`,
    );
    const other = await fixture();
    const allocation = requested!.allocations[0];
    const line = requested!.lines[0];

    await expect(prisma.refundAllocation.update({
      where: { id: allocation.id },
      data: { amount: { increment: 1 } },
    })).rejects.toThrow(/allocation total mismatch/);

    await expect(prisma.refundAllocation.update({
      where: { id: allocation.id },
      data: { originalPaymentId: other.card.id },
    })).rejects.toThrow(/invalid original payment/);

    const otherItem = await prisma.returnItem.findFirstOrThrow({ where: { returnId: other.ret.id } });
    await expect(prisma.refundLine.update({
      where: { id: line.id },
      data: { returnItemId: otherItem.id },
    })).rejects.toThrow(/RefundLine is immutable/);

    expect((await refunds.get(requested!.id))?.amount).toBe(100_000);
  });

  it('cannot reject an executed refund or rewrite its execution provenance', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'immutable execution', shiftId: f.shift.id },
      'cashier-1',
      `immutable-execution-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    await processor.processRefund(requested!.id, 'system:immutable-execution');

    await expect(prisma.refund.update({
      where: { id: requested!.id },
      data: { status: 'rejected' },
    })).rejects.toThrow(/executed refund .* cannot be rejected/);

    const executed = await refunds.get(requested!.id);
    const cardAllocation = executed!.allocations.find((allocation) => allocation.methodSnapshot === 'card')!;
    await expect(prisma.payment.update({
      where: { id: cardAllocation.refundPaymentId! },
      data: { method: 'cash', shiftId: f.shift.id },
    })).rejects.toThrow(/invalid execution provenance/);
    expect((await refunds.get(requested!.id))?.status).toBe('succeeded');
  });

  it('keeps Refund and Return rejection lifecycle atomic in both directions', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'atomic rejection lifecycle', shiftId: f.shift.id },
      'cashier-1',
      `atomic-rejection-${f.ret.id}`,
    );

    await expect(prisma.refund.update({
      where: { id: requested!.id },
      data: { status: 'rejected' },
    })).rejects.toThrow(/requires a rejected return/);
    await expect(prisma.return.update({
      where: { id: f.ret.id },
      data: { status: 'rejected' },
    })).rejects.toThrow(/rejected return requires rejected refund/);

    await prisma.$transaction([
      prisma.refund.update({ where: { id: requested!.id }, data: { status: 'rejected' } }),
      prisma.return.update({ where: { id: f.ret.id }, data: { status: 'rejected' } }),
    ]);
    expect((await refunds.get(requested!.id))?.status).toBe('rejected');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('rejected');
  });

  it('rejects direct gift-card balance drift outside the append-only journal', async () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const card = await prisma.giftCard.create({
      data: {
        code: `FIN003E-${suffix}`,
        initialBalance: 50_000,
        balance: 50_000,
        status: 'active',
        issuedBy: 'admin-2',
      },
    });

    await expect(prisma.giftCard.update({
      where: { id: card.id },
      data: { balance: 40_000 },
    })).rejects.toThrow(/balance does not match append-only journal/);
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance).toBe(50_000);
  });

  it('enforces refund and Return lifecycle invariants at the database boundary', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'lifecycle invariant', shiftId: f.shift.id },
      'cashier-1',
      `lifecycle-${f.ret.id}`,
    );

    await expect(prisma.refund.update({
      where: { id: requested!.id },
      data: { status: 'succeeded', completedAt: new Date() },
    })).rejects.toThrow(/not fully completed/);

    await expect(prisma.return.update({
      where: { id: f.ret.id },
      data: { status: 'paid' },
    })).rejects.toThrow(/unfinished refund .* cannot be completed/);

    await expect(prisma.refund.update({
      where: { id: requested!.id },
      data: { status: 'partially_succeeded' },
    })).rejects.toThrow(/invalid allocation state/);

    expect((await refunds.get(requested!.id))?.status).toBe('requested');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('processing');
  });

  it('enforces gift-card initial and running balances at the database boundary', async () => {
    const suffix = Math.random().toString(36).slice(2, 10);

    await expect(prisma.giftCard.create({
      data: {
        code: `FIN003E-MISMATCH-${suffix}`,
        initialBalance: 50_000,
        balance: 40_000,
        status: 'active',
        issuedBy: 'admin-2',
      },
    })).rejects.toThrow(/balance does not match append-only journal/);

    const card = await prisma.giftCard.create({
      data: {
        code: `FIN003E-RUNNING-${suffix}`,
        initialBalance: 50_000,
        balance: 50_000,
        status: 'active',
        issuedBy: 'admin-2',
      },
    });
    await expect(prisma.giftCard.update({
      where: { id: card.id },
      data: { initialBalance: 60_000, balance: 60_000 },
    })).rejects.toThrow(/initialBalance is immutable/);
    await expect(prisma.giftCard.update({
      where: { id: card.id },
      data: { balance: -1 },
    })).rejects.toThrow(/GiftCard_balances_nonnegative/);

    const customer = await prisma.customer.create({ data: { phone: `+99670${suffix}`, name: 'Gift card invariant' } });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', status: 'paid', total: 10_000 },
    });
    await expect(prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: 10_000,
          method: 'gift_card',
          status: 'received',
          giftCardId: card.id,
          idempotencyKey: `gift-card-running-${suffix}`,
          receivedBy: 'cashier-1',
        },
      });
      await tx.giftCard.update({ where: { id: card.id }, data: { balance: 40_000 } });
      await tx.giftCardTransaction.create({
        data: {
          giftCardId: card.id,
          paymentId: payment.id,
          type: 'redemption',
          amount: -10_000,
          balanceAfter: 39_999,
          sourceRef: `gift-card-running-${suffix}`,
          actor: 'cashier-1',
        },
      });
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    })).rejects.toThrow(/invalid running balance/);
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance).toBe(50_000);
  });

  it('revalidates immutable tax snapshots when the Order tax changes', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'order tax dependency', shiftId: f.shift.id },
      'cashier-1',
      `order-tax-${f.ret.id}`,
    );

    await expect(prisma.order.update({
      where: { id: f.order.id },
      data: { taxAmount: 0 },
    })).rejects.toThrow(/invalid tax snapshot/);
    expect((await refunds.get(requested!.id))?.lines[0].taxAmount).toBe(10_714);
  });

  it('revalidates tax snapshots when a preceding legacy refund journal changes', async () => {
    const f = await fixture();
    const suffix = Math.random().toString(36).slice(2, 10);
    const supplemental = await prisma.payment.create({
      data: {
        orderId: f.order.id,
        amount: 10_000,
        method: 'card',
        status: 'received',
        txnId: `supplemental-${suffix}`,
        point: 'BISHKEK-1',
      },
    });
    const legacyRefund = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId: f.order.id,
          originalPaymentId: supplemental.id,
          amount: -10_000,
          method: 'card',
          status: 'refunded',
          txnId: `legacy-tax-${suffix}`,
          point: 'BISHKEK-1',
        },
      });
      const entry = await tx.accountingJournalEntry.create({
        data: {
          idempotencyKey: `legacy-tax-${suffix}`,
          sourceType: 'payment.refund',
          sourceRef: payment.id,
          description: 'Legacy refund tax dependency',
          point: 'BISHKEK-1',
          documentAmount: 10_000,
          baseAmount: 10_000,
          taxCode: 'vat_output:vat_standard',
          taxRateBps: 1200,
          taxAmount: 1_000,
          occurredAt: payment.createdAt,
          createdBy: 'cashier-1',
          lines: { create: [
            { accountCode: '4000', debit: 9_000 },
            { accountCode: '2200', debit: 1_000 },
            { accountCode: '1020', credit: 10_000 },
          ] },
        },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { accountingEntryId: entry.id } });
      return { payment, entry };
    });
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'legacy journal dependency', shiftId: f.shift.id },
      'cashier-1',
      `legacy-tax-request-${suffix}`,
    );
    expect(requested?.lines[0].taxAmount).toBe(9_714);

    const otherOrder = await prisma.order.create({
      data: {
        customerId: f.order.customerId,
        status: 'paid',
        channel: 'pos',
        total: 10_000,
      },
    });
    await expect(prisma.payment.update({
      where: { id: legacyRefund.payment.id },
      data: { orderId: otherOrder.id },
    })).rejects.toThrow(/invalid tax snapshot/);
    await expect(prisma.payment.update({
      where: { id: legacyRefund.payment.id },
      data: { amount: 10_000 },
    })).rejects.toThrow(/invalid tax snapshot/);
    await expect(prisma.payment.delete({
      where: { id: legacyRefund.payment.id },
    })).rejects.toThrow(/invalid tax snapshot/);

    await expect(prisma.accountingJournalEntry.update({
      where: { id: legacyRefund.entry.id },
      data: { taxAmount: 5_000 },
    })).rejects.toThrow(/invalid tax snapshot/);
    expect((await refunds.get(requested!.id))?.lines[0].taxAmount).toBe(9_714);
  });

  it('continues the relay batch when one refund cannot be processed', async () => {
    const first = await fixture();
    const second = await fixture();
    const firstRefund = await refunds.request(first.ret.id, { reason: 'первый', shiftId: first.shift.id }, 'cashier-1', `batch-first-${first.ret.id}`);
    const secondRefund = await refunds.request(second.ret.id, { reason: 'второй', shiftId: second.shift.id }, 'cashier-1', `batch-second-${second.ret.id}`);
    await approvals.decide(firstRefund!.approvalId!, { status: 'approved', approver: 'admin-2', approverRole: 'admin' });
    await approvals.decide(secondRefund!.approvalId!, { status: 'approved', approver: 'admin-2', approverRole: 'admin' });
    await prisma.refund.update({ where: { id: firstRefund!.id }, data: { updatedAt: new Date('2026-01-01T00:00:00.000Z') } });

    const visited: string[] = [];
    const spy = jest.spyOn(processor, 'processRefund').mockImplementation(async (id) => {
      visited.push(id);
      if (id === firstRefund!.id) throw new Error('provider unavailable');
    });
    try {
      await expect(processor.processPending()).resolves.toBeGreaterThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
    expect(visited).toEqual(expect.arrayContaining([firstRefund!.id, secondRefund!.id]));
  });

  it('executes an approved refund through the relay batch without a second operator action', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'relay execution', shiftId: f.shift.id },
      'cashier-1',
      `relay-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });

    expect(await processor.processPending()).toBe(1);
    expect((await refunds.get(requested!.id))?.status).toBe('succeeded');
  });

  it('releases reserved capacity only after a verified terminal provider failure', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'provider terminal failure', shiftId: f.shift.id },
      'cashier-1',
      `terminal-failure-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    const providerRefundId = `terminal-provider-refund-${f.ret.id}`;
    const providerRefund = jest.fn(() => Promise.resolve({ providerRefundId, status: 'accepted' as const }));
    const acceptedProcessor = new RefundProcessor(prisma, new AuditService(prisma), {
      name: 'sandbox',
      assertOperational() {},
      createIntent: () => Promise.reject(new Error('not used')),
      verifyWebhook: () => Promise.reject(new Error('not used')),
      verifyRefundWebhook: (input) => Promise.resolve(input.payload as never),
      refund: providerRefund,
    });

    await acceptedProcessor.processRefund(requested!.id, 'system:submit');
    await acceptedProcessor.reconcileProviderRefund({
      providerRefundId,
      status: 'failed',
      providerReference: 'statement-terminal-1',
      failureCode: 'provider_rejected',
    }, 'system:provider-webhook');
    await acceptedProcessor.reconcileProviderRefund({
      providerRefundId,
      status: 'failed',
      providerReference: 'statement-terminal-1',
      failureCode: 'provider_rejected',
    }, 'system:provider-webhook-replay');

    expect(await acceptedProcessor.processPending()).toBe(0);
    expect(providerRefund).toHaveBeenCalledTimes(1);

    const cancelled = await refunds.cancel(
      requested!.id,
      { reason: 'verified provider terminal failure' },
      'admin-2',
      `cancel-terminal-${requested!.id}`,
    );
    const replay = await refunds.cancel(
      requested!.id,
      { reason: 'verified provider terminal failure' },
      'admin-2',
      `cancel-terminal-${requested!.id}`,
    );
    expect(cancelled?.status).toBe('rejected');
    expect(replay?.id).toBe(cancelled?.id);
    expect(await prisma.auditEvent.count({
      where: { type: 'refund.provider_failed', refs: { has: requested!.allocations[0].id } },
    })).toBe(1);
    expect(await acceptedProcessor.processPending()).toBe(0);
    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash }, 'cashier-1')).resolves.toBeDefined();
  });

  it('bounds ambiguous provider retries and keeps reservations without verified reconciliation', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'permanent provider failure', shiftId: f.shift.id },
      'cashier-1',
      `bounded-retry-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    const providerRefund = jest.fn(async () => {
      throw new Error('provider permanent rejection');
    });
    const failingProcessor = new RefundProcessor(prisma, new AuditService(prisma), {
      name: 'sandbox',
      assertOperational() {},
      createIntent: () => Promise.reject(new Error('not used')),
      verifyWebhook: () => Promise.reject(new Error('not used')),
      verifyRefundWebhook: (input) => Promise.resolve(input.payload as never),
      refund: providerRefund,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await prisma.refundAllocation.updateMany({
        where: { refundId: requested!.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await expect(failingProcessor.processRefund(requested!.id, `system:attempt-${attempt}`))
        .rejects.toThrow('provider permanent rejection');
    }
    await expect(failingProcessor.processRefund(requested!.id, 'system:attempt-exhausted'))
      .rejects.toMatchObject({ code: 'refund_retry_exhausted' });
    expect(providerRefund).toHaveBeenCalledTimes(5);

    const failed = await refunds.get(requested!.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.allocations[0]).toMatchObject({ status: 'failed', attempts: 5 });
    expect(failed?.allocations[0].nextAttemptAt).toBeInstanceOf(Date);
    expect(await failingProcessor.processPending()).toBe(0);
    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash }, 'cashier-1'))
      .rejects.toMatchObject({ code: 'shift_has_pending_refunds' });

    await expect(refunds.cancel(
      requested!.id,
      { reason: 'operator has no signed provider evidence' },
      'admin-2',
      `cancel-${requested!.id}`,
    )).rejects.toMatchObject({ code: 'refund_reconciliation_required' });
    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash }, 'cashier-1'))
      .rejects.toMatchObject({ code: 'shift_has_pending_refunds' });
  });
});
