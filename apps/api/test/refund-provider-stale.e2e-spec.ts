import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { AuditService } from '../src/audit/audit.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import {
  GatewayRefundInput,
  PAYMENT_GATEWAY_PROVIDER,
  PaymentGatewayProvider,
} from '../src/payments/payment-gateway-provider';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RefundsModule } from '../src/refunds/refunds.module';
import { RefundProcessor } from '../src/refunds/refunds.processor';
import { RefundsService } from '../src/refunds/refunds.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { clearGiftCardTransactions } from './db-test-cleanup';

const STALE_MS = 24 * 60 * 60_000;

function gatewayWith(refund: (input: GatewayRefundInput) => Promise<{ providerRefundId: string; status: 'accepted' | 'succeeded' }>): PaymentGatewayProvider {
  return {
    name: 'sandbox',
    assertOperational() {},
    createIntent: () => Promise.reject(new Error('not used')),
    verifyWebhook: () => Promise.reject(new Error('not used')),
    verifyRefundWebhook: (input) => Promise.resolve(input.payload as never),
    refund,
  };
}

/**
 * LOGIC-007: a refund stuck in `provider_pending` must not wait for a webhook
 * forever — the stale sweep parks it with a ledger event, a late webhook still
 * reconciles it, and an owner/admin can resolve (confirm/cancel) without any
 * provider callback, releasing the reserved tender capacity.
 */
describe('Refund provider_pending stale sweep and manual resolve (LOGIC-007)', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let refunds: RefundsService;
  let shifts: ShiftsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    refunds = new RefundsService(prisma, audit);
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
    const customer = await prisma.customer.create({ data: { phone: `+99655${suffix}`, name: 'Stale refund' } });
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
            sku: `STALE-${suffix}`,
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
      data: { orderId: order.id, amount: 60_000, method: 'card', status: 'received', txnId: `stale-card-${suffix}`, point: 'BISHKEK-1' },
    });
    const cash = await prisma.payment.create({
      data: { orderId: order.id, amount: 40_000, method: 'cash', status: 'received', point: 'BISHKEK-1' },
    });
    const shift = await prisma.cashShift.create({ data: { staffId: 'cashier-1', point: 'BISHKEK-1', openCash: 50_000 } });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'stuck provider refund',
        status: 'processing',
        refundAmount: 100_000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 100_000 } },
      },
    });
    return { order, card, cash, shift, ret, suffix };
  }

  /** Approve a refund and submit it to a provider that accepts but never calls back. */
  async function stuckRefund(providerRefundId: string) {
    const f = await fixture();
    const providerRefund = jest.fn(async (_input: GatewayRefundInput) => ({ providerRefundId, status: 'accepted' as const }));
    const processor = new RefundProcessor(prisma, new AuditService(prisma), gatewayWith(providerRefund));
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'провайдер принял и молчит', shiftId: f.shift.id },
      'cashier-1',
      `stuck-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, { status: 'approved', approver: 'admin-2', approverRole: 'admin' });
    await processor.processRefund(requested!.id, 'system:submit');
    const stuck = await refunds.get(requested!.id);
    const cardAllocation = stuck!.allocations.find((allocation) => allocation.methodSnapshot === 'card')!;
    const cashAllocation = stuck!.allocations.find((allocation) => allocation.methodSnapshot === 'cash')!;
    expect(cardAllocation.status).toBe('provider_pending');
    expect(cashAllocation.status).toBe('queued');
    return { f, processor, providerRefund, refundId: requested!.id, cardAllocation, cashAllocation };
  }

  async function ageAllocation(allocationId: string, ageMs = STALE_MS + 60_000) {
    await prisma.refundAllocation.update({
      where: { id: allocationId },
      data: { updatedAt: new Date(Date.now() - ageMs) },
    });
  }

  it('sweeps a stale provider_pending allocation into an auditable parked state, then a late webhook reconciles it', async () => {
    const { f, processor, providerRefund, refundId, cardAllocation } = await stuckRefund('stale-sweep-provider-refund-1');
    await ageAllocation(cardAllocation.id);

    expect(await processor.sweepStaleProviderPending(STALE_MS)).toBe(1);

    const swept = await prisma.refundAllocation.findUniqueOrThrow({ where: { id: cardAllocation.id } });
    expect(swept.status).toBe('failed');
    expect(swept.lastError).toMatch(/^provider_pending_stale:/);
    expect(swept.nextAttemptAt).toBeNull();
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe('failed');
    const staleEvents = await prisma.auditEvent.findMany({ where: { type: 'refund.provider_stale', refs: { has: refundId } } });
    expect(staleEvents).toHaveLength(1);
    expect(staleEvents[0].payload).toMatchObject({ refundId, allocationId: cardAllocation.id, staleMs: STALE_MS });

    // Idempotent and never auto-retried: a second sweep and the relay batch skip it.
    expect(await processor.sweepStaleProviderPending(STALE_MS)).toBe(0);
    expect(await processor.processPending()).toBe(0);
    await processor.processRefund(refundId, 'system:retry-after-sweep');
    expect(providerRefund).toHaveBeenCalledTimes(1);
    expect((await prisma.refundAllocation.findUniqueOrThrow({ where: { id: cardAllocation.id } })).status).toBe('failed');

    // A fresh provider_pending allocation is below the threshold and untouched.
    const fresh = await stuckRefund('stale-sweep-provider-refund-2');
    expect(await processor.sweepStaleProviderPending(STALE_MS)).toBe(0);
    expect((await prisma.refundAllocation.findUniqueOrThrow({ where: { id: fresh.cardAllocation.id } })).status).toBe('provider_pending');

    // The provider callback stays authoritative: a late webhook finalizes the parked allocation.
    await processor.reconcileProviderRefund(
      { providerRefundId: 'stale-sweep-provider-refund-1', status: 'succeeded', providerReference: 'statement-late-1' },
      'system:provider-webhook',
    );
    const completed = await refunds.get(refundId);
    expect(completed?.status).toBe('succeeded');
    expect(completed?.allocations.map((allocation) => allocation.status)).toEqual(['succeeded', 'succeeded']);
    expect((await prisma.refundAllocation.findUniqueOrThrow({ where: { id: cardAllocation.id } })).lastError).toBeNull();
    expect(await prisma.payment.count({ where: { orderId: f.order.id, amount: { lt: 0 } } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.succeeded', refs: { has: refundId } } })).toBe(1);
    expect(providerRefund).toHaveBeenCalledTimes(1);
  });

  it('manual confirm finalizes the stuck refund, unlocks allocations and writes compensating events', async () => {
    const { f, processor, refundId, cardAllocation } = await stuckRefund('manual-confirm-provider-refund');

    // While stuck, the reserved tender capacity and the open shift stay locked.
    const blockedReturn = await prisma.return.create({
      data: {
        orderId: f.order.id,
        reason: 'must wait for resolve',
        status: 'processing',
        refundAmount: 1,
        items: { create: { orderItemId: f.order.items[0].id, qty: 1, refundAmount: 1 } },
      },
    });
    await expect(refunds.request(
      blockedReturn.id,
      { reason: 'повторная аллокация', shiftId: f.shift.id },
      'cashier-1',
      `blocked-${f.ret.id}`,
    )).rejects.toMatchObject({ code: 'refund_exceeds_paid' });
    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash }, 'cashier-1'))
      .rejects.toMatchObject({ code: 'shift_has_pending_refunds' });

    await processor.resolveRefund(
      refundId,
      { action: 'confirm', reason: 'подтверждено выпиской провайдера', providerReference: 'statement-42' },
      'admin-2',
      `resolve-confirm-${refundId}`,
    );

    const resolved = await refunds.get(refundId);
    expect(resolved?.status).toBe('succeeded');
    expect(resolved?.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ methodSnapshot: 'card', status: 'succeeded', providerRefundId: 'manual-confirm-provider-refund' }),
      expect.objectContaining({ methodSnapshot: 'cash', status: 'succeeded' }),
    ]));
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('paid');
    const refundPayments = await prisma.payment.findMany({ where: { orderId: f.order.id, amount: { lt: 0 } } });
    expect(refundPayments).toHaveLength(2);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'payment.refund', sourceRef: { in: refundPayments.map((payment) => payment.id) } },
    })).toBe(2);

    const resolvedEvents = await prisma.auditEvent.findMany({ where: { type: 'refund.resolved', refs: { has: refundId } } });
    expect(resolvedEvents).toHaveLength(1);
    expect(resolvedEvents[0].actor).toBe('admin-2');
    expect(resolvedEvents[0].payload).toMatchObject({
      refundId,
      action: 'confirmed',
      providerReference: 'statement-42',
      withoutProviderCallback: true,
    });
    const resolvedPayload = resolvedEvents[0].payload as { allocationIds?: string[] };
    expect(resolvedPayload.allocationIds).toEqual([cardAllocation.id]);
    expect(await prisma.auditEvent.count({ where: { type: 'payment.refunded', refs: { has: refundId } } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.provider_succeeded', refs: { has: cardAllocation.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.succeeded', refs: { has: refundId } } })).toBe(1);

    // Replay with the same Idempotency-Key returns the resolved refund without duplicating money or events.
    const replay = await processor.resolveRefund(
      refundId,
      { action: 'confirm', reason: 'подтверждено выпиской провайдера', providerReference: 'statement-42' },
      'admin-2',
      `resolve-confirm-${refundId}`,
    );
    expect(replay.id).toBe(refundId);
    expect(await prisma.payment.count({ where: { orderId: f.order.id, amount: { lt: 0 } } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.resolved', refs: { has: refundId } } })).toBe(1);

    // The shift is unblocked once the refund is executed (cash drawer reflects the paid-out refund).
    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash - 40_000 }, 'cashier-1')).resolves.toBeDefined();
  });

  it('manual confirm also finalizes an allocation already parked by the stale sweep', async () => {
    const { processor, refundId, cardAllocation } = await stuckRefund('swept-confirm-provider-refund');
    await ageAllocation(cardAllocation.id);
    expect(await processor.sweepStaleProviderPending(STALE_MS)).toBe(1);
    expect((await prisma.refundAllocation.findUniqueOrThrow({ where: { id: cardAllocation.id } })).status).toBe('failed');

    await processor.resolveRefund(
      refundId,
      { action: 'confirm', reason: 'провайдер подтвердил по телефону и выписке' },
      'owner-1',
      `resolve-swept-${refundId}`,
    );

    const resolved = await refunds.get(refundId);
    expect(resolved?.status).toBe('succeeded');
    const card = await prisma.refundAllocation.findUniqueOrThrow({ where: { id: cardAllocation.id } });
    expect(card.status).toBe('succeeded');
    expect(card.lastError).toBeNull();
    expect(await prisma.auditEvent.count({ where: { type: 'refund.resolved', refs: { has: refundId } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.provider_stale', refs: { has: refundId } } })).toBe(1);
  });

  it('manual cancel rejects the stuck refund without any webhook event and releases the reserved tender', async () => {
    const { f, processor, refundId, cardAllocation, cashAllocation } = await stuckRefund('manual-cancel-provider-refund');

    // The strict cancel path still refuses: no verified terminal-failure webhook exists.
    await expect(refunds.cancel(
      refundId,
      { reason: 'строгий путь без callback' },
      'admin-2',
      `strict-cancel-${refundId}`,
    )).rejects.toMatchObject({ code: 'refund_not_cancellable' });

    await processor.resolveRefund(
      refundId,
      { action: 'cancel', reason: 'провайдер не выполнял возврат, выписка пуста' },
      'owner-1',
      `resolve-cancel-${refundId}`,
    );

    const cancelled = await refunds.get(refundId);
    expect(cancelled?.status).toBe('rejected');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('rejected');
    for (const allocationId of [cardAllocation.id, cashAllocation.id]) {
      const allocation = await prisma.refundAllocation.findUniqueOrThrow({ where: { id: allocationId } });
      expect(allocation.status).toBe('failed');
      expect(allocation.lastError).toMatch(/^operator_cancelled:/);
    }
    expect(await prisma.payment.count({ where: { orderId: f.order.id, amount: { lt: 0 } } })).toBe(0);
    // Cancel happened without any provider webhook fact.
    expect(await prisma.auditEvent.count({ where: { type: 'refund.provider_failed', refs: { has: refundId } } })).toBe(0);
    const resolvedEvents = await prisma.auditEvent.findMany({ where: { type: 'refund.resolved', refs: { has: refundId } } });
    expect(resolvedEvents).toHaveLength(1);
    expect(resolvedEvents[0].payload).toMatchObject({
      refundId,
      action: 'cancelled',
      withoutProviderCallback: true,
    });

    // Replay is idempotent.
    const replay = await processor.resolveRefund(
      refundId,
      { action: 'cancel', reason: 'провайдер не выполнял возврат, выписка пуста' },
      'owner-1',
      `resolve-cancel-${refundId}`,
    );
    expect(replay.id).toBe(refundId);
    expect(await prisma.auditEvent.count({ where: { type: 'refund.resolved', refs: { has: refundId } } })).toBe(1);

    // Released tender capacity: a new return on the same order allocates in full.
    const secondReturn = await prisma.return.create({
      data: {
        orderId: f.order.id,
        reason: 'refund after operator cancel',
        status: 'processing',
        refundAmount: 100_000,
        items: { create: { orderItemId: f.order.items[0].id, qty: 1, refundAmount: 100_000 } },
      },
    });
    const second = await refunds.request(
      secondReturn.id,
      { reason: 'полный возврат после отмены', shiftId: f.shift.id },
      'cashier-1',
      `after-cancel-${f.ret.id}`,
    );
    expect(second?.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalPaymentId: f.card.id, amount: 60_000 }),
      expect.objectContaining({ originalPaymentId: f.cash.id, amount: 40_000 }),
    ]));
    await expect(shifts.close(f.shift.id, { closeCash: f.shift.openCash }, 'cashier-1'))
      .rejects.toMatchObject({ code: 'shift_has_pending_refunds' });
  });

  it('manual cancel covers the bare-500 case: exhausted retries without any callback become cancellable', async () => {
    const f = await fixture();
    const providerRefund = jest.fn(async (_input: GatewayRefundInput) => {
      throw new Error('HTTP 500 from provider');
    });
    const processor = new RefundProcessor(prisma, new AuditService(prisma), gatewayWith(providerRefund));
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'провайдер отвечает 500', shiftId: f.shift.id },
      'cashier-1',
      `bare-500-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, { status: 'approved', approver: 'admin-2', approverRole: 'admin' });
    await expect(processor.processRefund(requested!.id, 'system:submit')).rejects.toThrow('HTTP 500 from provider');
    const cardAllocation = requested!.allocations.find((allocation) => allocation.methodSnapshot === 'card')!;
    await prisma.refundAllocation.update({ where: { id: cardAllocation.id }, data: { attempts: 5 } });

    // Neither auto-retry nor the strict cancel path can move it without a webhook.
    await expect(processor.processRefund(requested!.id, 'system:retry-exhausted'))
      .rejects.toMatchObject({ code: 'refund_retry_exhausted' });
    expect(providerRefund).toHaveBeenCalledTimes(1);
    await expect(refunds.cancel(
      requested!.id,
      { reason: 'нет подписанного факта провайдера' },
      'admin-2',
      `strict-500-${requested!.id}`,
    )).rejects.toMatchObject({ code: 'refund_reconciliation_required' });

    await processor.resolveRefund(
      requested!.id,
      { action: 'cancel', reason: 'провайдер подтвердил, что возврат не создавался' },
      'admin-2',
      `resolve-500-${requested!.id}`,
    );
    expect((await refunds.get(requested!.id))?.status).toBe('rejected');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe('rejected');
    expect(await prisma.payment.count({ where: { orderId: f.order.id, amount: { lt: 0 } } })).toBe(0);
    expect(await prisma.auditEvent.count({
      where: { type: 'refund.resolved', refs: { has: requested!.id } },
    })).toBe(1);

    const secondReturn = await prisma.return.create({
      data: {
        orderId: f.order.id,
        reason: 'refund after bare-500 cancel',
        status: 'processing',
        refundAmount: 100_000,
        items: { create: { orderItemId: f.order.items[0].id, qty: 1, refundAmount: 100_000 } },
      },
    });
    const second = await refunds.request(
      secondReturn.id,
      { reason: 'полный возврат после отмены', shiftId: f.shift.id },
      'cashier-1',
      `after-500-${f.ret.id}`,
    );
    expect(second?.allocations).toHaveLength(2);
  });

  it('rejects resolving a refund that has no provider-pending allocations', async () => {
    const f = await fixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'обычный возврат', shiftId: f.shift.id },
      'cashier-1',
      `nothing-to-resolve-${f.ret.id}`,
    );
    const processor = new RefundProcessor(prisma, new AuditService(prisma), gatewayWith(jest.fn()));
    await expect(processor.resolveRefund(
      requested!.id,
      { action: 'confirm', reason: 'нечего подтверждать' },
      'admin-2',
      `resolve-empty-${requested!.id}`,
    )).rejects.toMatchObject({ code: 'refund_not_resolvable' });
    await expect(processor.resolveRefund(
      requested!.id,
      { action: 'cancel', reason: 'нечего отменять' },
      'admin-2',
      `resolve-empty-cancel-${requested!.id}`,
    )).rejects.toMatchObject({ code: 'refund_not_resolvable' });
  });
});

describe('POST /refunds/:id/resolve RBAC (LOGIC-007)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  let gatewaySequence = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        RefundsModule,
      ],
      providers: [JwtStrategy],
    })
      .overrideProvider(PAYMENT_GATEWAY_PROVIDER)
      .useValue(gatewayWith(async () => {
        gatewaySequence += 1;
        return { providerRefundId: `http-resolve-provider-refund-${RUN}-${gatewaySequence}`, status: 'accepted' as const };
      }))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
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

  async function staffToken(role: 'seller' | 'admin' | 'owner') {
    const staff = await prisma.staffUser.create({
      data: {
        username: `resolve-${role}-${RUN}-${Math.random()}`,
        passwordHash: await argon2.hash('pass'),
        role,
      },
    });
    return { accessToken: jwt.sign({ sub: staff.id, typ: 'staff', role }), staffId: staff.id };
  }

  async function stuckRefundFixture() {
    const suffix = Math.random().toString(36).slice(2, 10);
    const customer = await prisma.customer.create({ data: { phone: `+99655${suffix}`, name: 'Resolve RBAC' } });
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
            sku: `RBAC-${suffix}`,
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
    await prisma.payment.create({
      data: { orderId: order.id, amount: 100_000, method: 'card', status: 'received', txnId: `rbac-card-${suffix}`, point: 'BISHKEK-1' },
    });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'stuck provider refund',
        status: 'processing',
        refundAmount: 100_000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 100_000 } },
      },
    });
    return { order, ret, suffix };
  }

  it('forbids non-manager roles and requires the Idempotency-Key header', async () => {
    const { ret, suffix } = await stuckRefundFixture();
    const admin = await staffToken('admin');
    const created = await request(app.getHttpServer())
      .post(`/returns/${ret.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('Idempotency-Key', `http-stuck-${suffix}`)
      .send({ reason: 'застрявший provider refund' })
      .expect(202);
    const refundId = created.body.id as string;

    const approval = await prisma.approval.findFirstOrThrow({
      where: { action: 'refund', status: 'requested' },
      orderBy: { createdAt: 'desc' },
    });
    await new ApprovalsService(prisma, new AuditService(prisma)).decide(approval.id, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    // Drive the refund into provider_pending through the relay processor path.
    await request(app.getHttpServer())
      .post(`/refunds/${refundId}/retry`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    const stuck = await prisma.refundAllocation.findFirstOrThrow({ where: { refundId } });
    expect(stuck.status).toBe('provider_pending');

    // Seller has no refunds,manage permission.
    const seller = await staffToken('seller');
    await request(app.getHttpServer())
      .post(`/refunds/${refundId}/resolve`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .set('Idempotency-Key', `resolve-seller-${suffix}`)
      .send({ action: 'confirm', reason: 'нет прав на resolve' })
      .expect(403);

    // Idempotency-Key is mandatory.
    await request(app.getHttpServer())
      .post(`/refunds/${refundId}/resolve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'confirm', reason: 'без ключа' })
      .expect(400);

    // Admin (manager) confirms without any provider callback.
    await request(app.getHttpServer())
      .post(`/refunds/${refundId}/resolve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('Idempotency-Key', `resolve-admin-${suffix}`)
      .send({ action: 'confirm', reason: 'подтверждено выпиской провайдера', providerReference: 'stmt-http-1' })
      .expect(201);
    const resolved = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    expect(resolved.status).toBe('succeeded');
    expect(await prisma.auditEvent.count({ where: { type: 'refund.resolved', refs: { has: refundId } } })).toBe(1);
  });

  it('owner cancels a stuck refund through the HTTP endpoint', async () => {
    const { ret, suffix } = await stuckRefundFixture();
    const admin = await staffToken('admin');
    const created = await request(app.getHttpServer())
      .post(`/returns/${ret.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('Idempotency-Key', `http-stuck-${suffix}`)
      .send({ reason: 'застрявший provider refund' })
      .expect(202);
    const refundId = created.body.id as string;
    const approval = await prisma.approval.findFirstOrThrow({
      where: { action: 'refund', status: 'requested' },
      orderBy: { createdAt: 'desc' },
    });
    await new ApprovalsService(prisma, new AuditService(prisma)).decide(approval.id, {
      status: 'approved', approver: 'admin-2', approverRole: 'admin',
    });
    await request(app.getHttpServer())
      .post(`/refunds/${refundId}/retry`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(201);
    expect((await prisma.refundAllocation.findFirstOrThrow({ where: { refundId } })).status).toBe('provider_pending');

    const owner = await staffToken('owner');
    await request(app.getHttpServer())
      .post(`/refunds/${refundId}/resolve`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('Idempotency-Key', `resolve-owner-${suffix}`)
      .send({ action: 'cancel', reason: 'провайдер не выполнял возврат' })
      .expect(201);
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe('rejected');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('rejected');
  });
});
