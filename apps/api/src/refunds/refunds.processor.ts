import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { applyCampaignRefundOnTx } from '../campaigns/campaign-refund-adjustment';
import { ConflictError, ValidationError } from '../common/errors';
import { reconcileRefundLoyaltyOnTx } from '../customers/loyalty-ledger';
import { postPaymentEntryOnTx } from '../finance/accounting-journal';
import { cumulativeTaxDelta, outputTaxMetadata } from '../finance/sales-tax';
import { canTransition } from '../orders/order-state-machine';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import {
  GatewayRefundWebhookPayload,
  PAYMENT_GATEWAY_PROVIDER,
  PaymentGatewayProvider,
} from '../payments/payment-gateway-provider';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveRefundDto } from './refunds.dto';
import {
  DEFAULT_PROVIDER_PENDING_STALE_MS,
  MAX_REFUND_ATTEMPTS,
  PROVIDER_PENDING_STALE_PREFIX,
  PROVIDER_TERMINAL_FAILURE_PREFIX,
  isStaleProviderPendingFailure,
  nextRefundAttempt,
} from './refunds.constants';

const PROVIDER_METHODS = new Set<PaymentMethod>(['card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment']);

/** Retry selection skips allocations parked for operator reconciliation. */
const RETRYABLE_LAST_ERROR: Prisma.RefundAllocationWhereInput = {
  OR: [
    { lastError: null },
    {
      NOT: {
        OR: [
          { lastError: { startsWith: PROVIDER_TERMINAL_FAILURE_PREFIX } },
          { lastError: { startsWith: PROVIDER_PENDING_STALE_PREFIX } },
        ],
      },
    },
  ],
};

@Injectable()
export class RefundProcessor {
  private readonly logger = new Logger(RefundProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_GATEWAY_PROVIDER) private readonly gateway: PaymentGatewayProvider,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  async processRefund(refundId: string, actor = 'system:refund-worker') {
    const aggregate = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { allocations: { orderBy: { ordinal: 'asc' } } } });
    if (!aggregate) throw new ValidationError('refund_not_found', 'Refund не найден');
    if (!['approved', 'processing', 'partially_succeeded', 'failed'].includes(aggregate.status)) {
      if (aggregate.status === 'succeeded') return;
      throw new ConflictError('refund_not_approved', `Refund имеет статус ${aggregate.status}`);
    }
    try {
      if (aggregate.allocations.some((allocation) =>
        PROVIDER_METHODS.has(allocation.methodSnapshot) && ['queued', 'failed'].includes(allocation.status))) {
        this.gateway.assertOperational();
      }
      await this.preflightAllocations(
        aggregate.allocations.filter((allocation) => !['succeeded', 'provider_pending'].includes(allocation.status)),
        aggregate.requester,
      );
    } catch (error) {
      await this.deferPreflightFailure(aggregate.id, error, actor);
      throw error;
    }
    const executionOrder = [...aggregate.allocations].sort((left, right) =>
      executionPriority(left.methodSnapshot) - executionPriority(right.methodSnapshot) || left.ordinal - right.ordinal,
    );
    for (const allocation of executionOrder) {
      if (allocation.status === 'succeeded') continue;
      if (allocation.status === 'provider_pending') return;
      const processed = await this.processAllocation(allocation.id, actor);
      if (!processed) return;
      const current = await this.prisma.refundAllocation.findUnique({
        where: { id: allocation.id },
        select: { status: true },
      });
      if (current?.status !== 'succeeded') return;
    }
    await this.completeIfReady(refundId, actor);
  }

  async processPending(limit = 25) {
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    const stale = await this.prisma.refundAllocation.findMany({
      where: { status: 'processing', lockedAt: { lt: staleBefore } },
      select: { id: true, refundId: true, attempts: true },
    });
    for (const allocation of stale) {
      await this.recordFailure(allocation.id, allocation.refundId, 'stale_worker_claim', 'system:refund-worker', allocation.attempts);
    }
    const rows = await this.prisma.refund.findMany({
      where: {
        status: { in: ['approved', 'processing', 'partially_succeeded', 'failed'] },
        allocations: {
          some: {
            status: { in: ['queued', 'failed'] },
            attempts: { lt: MAX_REFUND_ATTEMPTS },
            AND: [
              RETRYABLE_LAST_ERROR,
              { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
            ],
          },
          none: {
            status: { in: ['queued', 'failed'] },
            OR: [
              { attempts: { gte: MAX_REFUND_ATTEMPTS } },
              { nextAttemptAt: { gt: new Date() } },
              { lastError: { startsWith: PROVIDER_TERMINAL_FAILURE_PREFIX } },
              { lastError: { startsWith: PROVIDER_PENDING_STALE_PREFIX } },
            ],
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const row of rows) {
      try {
        await this.processRefund(row.id);
      } catch (error) {
        const errorClass = classifyRefundError(error instanceof Error ? error.message : 'unknown_refund_error');
        this.logger.warn(`Refund ${row.id} deferred after ${errorClass} failure`);
      }
    }
    return rows.length;
  }

  private async processAllocation(id: string, actor: string) {
    const candidate = await this.prisma.refundAllocation.findUnique({
      where: { id },
      select: { originalPaymentId: true, amount: true, attempts: true, nextAttemptAt: true },
    });
    if (!candidate) return false;
    if (candidate.attempts >= MAX_REFUND_ATTEMPTS) {
      throw new ConflictError('refund_retry_exhausted', 'Лимит автоматических попыток исчерпан; нужна сверка оператора');
    }
    if (candidate.nextAttemptAt && candidate.nextAttemptAt > new Date()) return false;
    await this.assertTenderCapacity(id, candidate.originalPaymentId, candidate.amount);
    const claimed = await this.prisma.refundAllocation.updateMany({
      where: {
        id,
        status: { in: ['queued', 'failed'] },
        attempts: { lt: MAX_REFUND_ATTEMPTS },
        AND: [
          RETRYABLE_LAST_ERROR,
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        ],
      },
      data: { status: 'processing', attempts: { increment: 1 }, lockedAt: new Date(), nextAttemptAt: null, lastError: null },
    });
    if (claimed.count === 0) return false;
    const allocation = await this.prisma.refundAllocation.findUnique({
      where: { id }, include: { refund: true, originalPayment: true },
    });
    if (!allocation) return false;
    const claimAttempt = allocation.attempts;

    try {
      let providerRefundId: string | null = null;
      if (PROVIDER_METHODS.has(allocation.methodSnapshot)) {
        await this.assertTenderCapacity(allocation.id, allocation.originalPaymentId, allocation.amount);
        if (!allocation.originalPayment.txnId) throw new ValidationError('provider_txn_missing', 'У исходного платежа нет provider txnId');
        const result = await this.gateway.refund({
          paymentId: allocation.originalPaymentId,
          providerTxnId: allocation.originalPayment.txnId,
          amount: allocation.amount,
          idempotencyKey: `refund:${allocation.id}`,
          reason: allocation.refund.reason,
        });
        providerRefundId = result.providerRefundId;
        if (result.status === 'accepted') {
          await this.markProviderPending(allocation.id, actor, result.providerRefundId, claimAttempt);
          return true;
        }
      }
      await this.finalize(allocation.id, allocation.refundId, actor, providerRefundId, claimAttempt);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'unknown_refund_error';
      await this.recordFailure(id, allocation.refundId, message, actor, claimAttempt);
      throw error;
    }
  }

  /**
   * LOGIC-007 stale sweep: a provider refund accepted but never confirmed by a
   * webhook (lost callback, provider outage) is parked once it is older than
   * `staleMs`. Parking moves the allocation out of the ambiguous
   * `provider_pending` limbo into a `failed` state with a
   * `provider_pending_stale:` marker that the retry selection skips — only a
   * late provider webhook or an operator resolve can move it further, because
   * blindly re-calling the provider could double-refund. The state change and
   * its `refund.provider_stale` ledger event commit atomically per allocation.
   */
  async sweepStaleProviderPending(staleMs = DEFAULT_PROVIDER_PENDING_STALE_MS, limit = 25, actor = 'system:refund-stale-sweep') {
    const staleBefore = new Date(Date.now() - staleMs);
    const stale = await this.prisma.refundAllocation.findMany({
      where: { status: 'provider_pending', updatedAt: { lt: staleBefore } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true, refundId: true, providerRefundId: true },
    });
    let swept = 0;
    for (const allocation of stale) {
      try {
        if (await this.markProviderPendingStale(allocation.id, allocation.refundId, allocation.providerRefundId, staleMs, actor)) {
          swept += 1;
        }
      } catch (error) {
        this.logger.warn(`Stale sweep skipped refund allocation ${allocation.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    return swept;
  }

  private async markProviderPendingStale(
    allocationId: string,
    refundId: string,
    providerRefundId: string | null,
    staleMs: number,
    actor: string,
  ) {
    return this.audit.transaction(async (tx) => {
      const changed = await tx.refundAllocation.updateMany({
        where: { id: allocationId, status: 'provider_pending' },
        data: {
          status: 'failed',
          lastError: `${PROVIDER_PENDING_STALE_PREFIX}${staleMs}`,
          lockedAt: null,
          nextAttemptAt: null,
        },
      });
      if (changed.count === 0) return { result: false, events: [] };
      const succeeded = await tx.refundAllocation.count({ where: { refundId, status: 'succeeded' } });
      await tx.refund.update({
        where: { id: refundId },
        data: { status: succeeded > 0 ? 'partially_succeeded' : 'failed' },
      });
      return {
        result: true,
        events: [{
          type: EventType.RefundProviderStale,
          actor,
          payload: { refundId, allocationId, providerRefundId, staleMs },
          refs: [refundId, allocationId, providerRefundId].filter((ref): ref is string => Boolean(ref)),
        }],
      };
    });
  }

  async reconcileProviderRefund(payload: GatewayRefundWebhookPayload, actor: string) {
    const allocation = await this.prisma.refundAllocation.findUnique({
      where: { providerRefundId: payload.providerRefundId },
      include: { refund: true },
    });
    if (!allocation) throw new ValidationError('provider_refund_not_found', 'Provider refund не найден');
    if (allocation.status === 'succeeded') return;
    if (allocation.status === 'failed' && isStaleProviderPendingFailure(allocation.lastError)) {
      // A stale-parked allocation is not a verified failure: the provider
      // callback stays authoritative. Restore provider_pending so the normal
      // reconciliation path finalizes or terminal-fails it exactly once.
      const restored = await this.prisma.refundAllocation.updateMany({
        where: {
          id: allocation.id,
          status: 'failed',
          lastError: { startsWith: PROVIDER_PENDING_STALE_PREFIX },
        },
        data: { status: 'provider_pending', lastError: null },
      });
      if (restored.count > 0) allocation.status = 'provider_pending';
    }
    if (allocation.status === 'failed') {
      const verifiedFailure = await this.prisma.auditEvent.findFirst({
        where: { type: EventType.RefundProviderFailed, refs: { has: allocation.id } },
        select: { id: true },
      });
      if (verifiedFailure) return;
    }
    if (allocation.status !== 'provider_pending') {
      throw new ConflictError('provider_refund_not_pending', `Аллокация имеет статус ${allocation.status}`);
    }

    if (payload.status === 'failed') {
      await this.audit.transaction(async (tx) => {
        const changed = await tx.refundAllocation.updateMany({
          where: { id: allocation.id, status: 'provider_pending', providerRefundId: payload.providerRefundId },
          data: {
            status: 'failed',
            lastError: `provider_terminal_failure:${payload.failureCode ?? 'unspecified'}`,
            lockedAt: null,
            nextAttemptAt: null,
          },
        });
        const current = await tx.refundAllocation.findUniqueOrThrow({ where: { id: allocation.id } });
        if (changed.count === 0) return { result: current, events: [] };
        const succeeded = await tx.refundAllocation.count({ where: { refundId: allocation.refundId, status: 'succeeded' } });
        await tx.refund.update({
          where: { id: allocation.refundId },
          data: { status: succeeded > 0 ? 'partially_succeeded' : 'failed' },
        });
        if (succeeded === 0) await this.notifyRefundFailedOnTx(tx, allocation.refundId);
        return {
          result: current,
          events: [{
            type: EventType.RefundProviderFailed,
            actor,
            payload: {
              refundId: allocation.refundId,
              allocationId: allocation.id,
              providerRefundId: payload.providerRefundId,
              providerReference: payload.providerReference ?? null,
              failureCode: payload.failureCode ?? null,
            },
            refs: [allocation.refundId, allocation.id, payload.providerRefundId],
          }],
        };
      });
      return;
    }

    await this.finalize(
      allocation.id,
      allocation.refundId,
      actor,
      payload.providerRefundId,
      allocation.attempts,
      payload.providerReference ?? null,
      'provider_pending',
    );
    await this.processRefund(allocation.refundId, actor);
  }

  /**
   * LOGIC-007 operator resolve for a refund stuck without a provider callback
   * (stale `provider_pending`, stale-parked or bare-500 `failed` allocations):
   * - `confirm` attests the provider executed the refund and finalizes the
   *   pending allocations locally — compensating payment, accounting entry,
   *   gift-card restore and completion cascade, exactly as a success webhook
   *   would, plus a `refund.resolved` ledger event naming the operator.
   * - `cancel` attests the provider did NOT execute it and rejects the refund,
   *   releasing the reserved tender capacity without any webhook event.
   * Idempotent per Idempotency-Key via the replayed `refund.resolved` event.
   */
  async resolveRefund(refundId: string, dto: ResolveRefundDto, actor: string, idempotencyKey: string) {
    if (dto.action !== 'confirm' && dto.action !== 'cancel') {
      throw new ValidationError('refund_resolve_action_invalid', 'Действие resolve должно быть confirm или cancel');
    }
    const reason = dto.reason.trim();
    const providerReference = dto.providerReference?.trim() || null;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ id: refundId, action: dto.action, reason, providerReference }))
      .digest('hex');
    const idempotencyRef = `idempotency:${idempotencyKey}`;
    const replay = await this.prisma.auditEvent.findFirst({
      where: { type: EventType.RefundResolved, refs: { has: idempotencyRef } },
    });
    if (replay) {
      if (!replay.refs.includes(refundId)) throw new ConflictError('idempotency_key_reused', 'Ключ уже использован для другого возврата');
      if ((replay.payload as Record<string, unknown>).requestHash !== requestHash) {
        throw new ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
      }
      return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    }
    if (dto.action === 'cancel') {
      return this.resolveCancel(refundId, reason, actor, requestHash, idempotencyRef);
    }
    return this.resolveConfirm(refundId, reason, providerReference, actor, requestHash, idempotencyRef);
  }

  private async resolveConfirm(
    refundId: string,
    reason: string,
    providerReference: string | null,
    actor: string,
    requestHash: string,
    idempotencyRef: string,
  ) {
    // Symmetric with resolveCancel (LEDGER-HARDEN-32): take the resolve advisory
    // lock and re-check replay under it before any provider confirmation, so two
    // confirms for the same idempotency key serialize here and a confirm that
    // races a completed resolve returns idempotently instead of re-finalizing.
    // The per-allocation finalize loop below keeps its own transactions to
    // preserve partial success, and stays the authority against double-refund
    // via each allocation's FOR UPDATE + status guard.
    const replayed = await this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'refund-resolve:' + idempotencyRef}))::text AS locked`;
      const replay = await tx.auditEvent.findFirst({
        where: { type: EventType.RefundResolved, refs: { has: idempotencyRef } },
      });
      if (replay && (!replay.refs.includes(refundId) || (replay.payload as Record<string, unknown>).requestHash !== requestHash)) {
        throw new ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
      }
      return { result: Boolean(replay), events: [] };
    });
    if (replayed) return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });

    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { allocations: { orderBy: { ordinal: 'asc' } } },
    });
    if (!refund) throw new ValidationError('refund_not_found', 'Refund не найден');
    if (!['processing', 'partially_succeeded', 'failed'].includes(refund.status)) {
      throw new ConflictError('refund_not_resolvable', `Подтверждение без callback возможно только для зависшего исполнения, текущий статус ${refund.status}`);
    }
    const resolvable = refund.allocations.filter((allocation) =>
      allocation.status === 'provider_pending'
      || (allocation.status === 'failed' && isStaleProviderPendingFailure(allocation.lastError)));
    if (resolvable.length === 0) {
      throw new ConflictError('refund_not_resolvable', 'Нет аллокаций, ожидающих provider callback');
    }
    if (resolvable.some((allocation) => !allocation.providerRefundId)) {
      throw new ConflictError('provider_refund_missing', 'Аллокация не имеет provider refund для подтверждения');
    }
    let first = true;
    for (const allocation of resolvable) {
      await this.finalize(
        allocation.id,
        refundId,
        actor,
        allocation.providerRefundId!,
        allocation.attempts,
        first ? providerReference : null,
        'provider_pending',
        {
          restoreStaleFailure: true,
          extraEvents: first ? [{
            type: EventType.RefundResolved,
            actor,
            payload: {
              refundId,
              action: 'confirmed',
              reason,
              requestHash,
              allocationIds: resolvable.map((item) => item.id),
              providerReference,
              withoutProviderCallback: true,
            },
            refs: [refundId, refund.returnId, refund.orderId, idempotencyRef, ...resolvable.map((item) => item.id)],
          }] : undefined,
        },
      );
      first = false;
    }
    await this.processRefund(refundId, actor);
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  }

  private async resolveCancel(
    refundId: string,
    reason: string,
    actor: string,
    requestHash: string,
    idempotencyRef: string,
  ) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'refund-resolve:' + idempotencyRef}))::text AS locked`;
      const replay = await tx.auditEvent.findFirst({
        where: { type: EventType.RefundResolved, refs: { has: idempotencyRef } },
      });
      if (replay) {
        if (!replay.refs.includes(refundId) || (replay.payload as Record<string, unknown>).requestHash !== requestHash) {
          throw new ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
        }
        return { result: await tx.refund.findUniqueOrThrow({ where: { id: refundId } }), events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
      const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { allocations: true } });
      if (!refund) throw new ValidationError('refund_not_found', 'Refund не найден');
      if (!['processing', 'failed'].includes(refund.status)) {
        throw new ConflictError('refund_not_resolvable', `Отмена без callback возможна только для зависшего исполнения, текущий статус ${refund.status}`);
      }
      if (refund.allocations.some((allocation) => ['processing', 'succeeded'].includes(allocation.status))) {
        throw new ConflictError('refund_reconciliation_required', 'Есть исполняемая или подтверждённая аллокация; нужна финансовая сверка');
      }
      const cancellable = refund.allocations.filter((allocation) =>
        ['queued', 'provider_pending', 'failed'].includes(allocation.status));
      if (cancellable.length === 0) {
        throw new ConflictError('refund_not_resolvable', 'Нет аллокаций для отмены');
      }
      await tx.refundAllocation.updateMany({
        where: { refundId, status: { in: ['queued', 'provider_pending', 'failed'] } },
        data: { status: 'failed', lastError: `operator_cancelled:${reason}`, lockedAt: null, nextAttemptAt: null },
      });
      const result = await tx.refund.update({ where: { id: refundId }, data: { status: 'rejected' } });
      await tx.return.update({ where: { id: refund.returnId }, data: { status: 'rejected' } });
      return {
        result,
        events: [{
          type: EventType.RefundResolved,
          actor,
          payload: {
            refundId,
            action: 'cancelled',
            reason,
            requestHash,
            allocationIds: cancellable.map((allocation) => allocation.id),
            withoutProviderCallback: true,
          },
          refs: [refundId, refund.returnId, refund.orderId, idempotencyRef, ...cancellable.map((allocation) => allocation.id)],
        }],
      };
    });
  }

  private async assertTenderCapacity(allocationId: string, originalPaymentId: string, amount: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${originalPaymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: originalPaymentId } });
      if (!payment || payment.amount <= 0) {
        throw new ValidationError('refund_payment_not_found', 'Исходный платёж не найден');
      }
      const [executed, reserved] = await Promise.all([
        tx.payment.aggregate({ where: { originalPaymentId }, _sum: { amount: true } }),
        tx.refundAllocation.aggregate({
          where: {
            originalPaymentId,
            id: { not: allocationId },
            status: { in: ['queued', 'processing', 'provider_pending', 'failed'] },
            refund: { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded', 'failed'] } },
          },
          _sum: { amount: true },
        }),
      ]);
      const available = payment.amount + (executed._sum.amount ?? 0) - (reserved._sum.amount ?? 0);
      if (amount > available) {
        throw new ConflictError('refund_exceeds_tender', 'Возврат превышает доступный остаток исходного платежа');
      }
    });
  }

  private async finalize(
    allocationId: string,
    refundId: string,
    actor: string,
    providerRefundId: string | null,
    claimAttempt: number,
    providerReference: string | null = null,
    expectedStatus: 'processing' | 'provider_pending' = 'processing',
    options: { restoreStaleFailure?: boolean; extraEvents?: AuditInput[] } = {},
  ) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "RefundAllocation" WHERE id = ${allocationId} FOR UPDATE`;
      const allocation = await tx.refundAllocation.findUnique({
        where: { id: allocationId },
        include: {
          refund: { include: { lines: true, allocations: { orderBy: { ordinal: 'asc' } }, order: { include: { items: true } } } },
          originalPayment: true,
        },
      });
      if (!allocation) throw new ValidationError('refund_allocation_not_found', 'Аллокация возврата не найдена');
      if (allocation.status === 'succeeded') return { result: allocation, events: [] };
      if (allocation.attempts !== claimAttempt) return { result: allocation, events: [] };
      if (options.restoreStaleFailure && allocation.status === 'failed' && isStaleProviderPendingFailure(allocation.lastError)) {
        // Operator confirm of a stale-parked allocation: restore the expected
        // state inside this locked transaction, then finalize as usual.
        await tx.refundAllocation.update({
          where: { id: allocationId },
          data: { status: 'provider_pending', lastError: null },
        });
        allocation.status = 'provider_pending';
        allocation.lastError = null;
      }
      if (allocation.status !== expectedStatus) {
        throw new ConflictError('refund_allocation_not_claimed', 'Аллокация не находится в ожидаемом состоянии исполнения');
      }
      if (expectedStatus === 'provider_pending' && allocation.providerRefundId !== providerRefundId) {
        throw new ConflictError('provider_refund_mismatch', 'Provider refund не соответствует аллокации');
      }
      if (allocation.refund.status === 'rejected') throw new ConflictError('refund_rejected', 'Refund отклонён');

      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${allocation.originalPaymentId} FOR UPDATE`;
      const prior = await tx.payment.aggregate({ where: { originalPaymentId: allocation.originalPaymentId }, _sum: { amount: true } });
      if (allocation.amount > allocation.originalPayment.amount + (prior._sum.amount ?? 0)) {
        throw new ConflictError('refund_exceeds_tender', 'Возврат превышает остаток исходного платежа');
      }
      if (allocation.methodSnapshot === 'cash') await this.assertExecutionShift(tx, allocation.shiftId, allocation.refund.requester, allocation.originalPayment.point);

      const key = `refund:${allocation.id}`;
      const payment = await tx.payment.create({
        data: {
          orderId: allocation.refund.orderId,
          originalPaymentId: allocation.originalPaymentId,
          amount: -allocation.amount,
          method: allocation.methodSnapshot,
          status: 'refunded',
          shiftId: allocation.shiftId,
          giftCardId: allocation.originalPayment.giftCardId,
          idempotencyKey: key,
          txnId: providerRefundId ?? key,
          receivedBy: allocation.refund.requester,
          point: allocation.originalPayment.point,
        },
      });
      const totalTax = allocation.refund.lines.reduce((sum, line) => sum + line.taxAmount, 0);
      const allocatedBefore = allocation.refund.allocations
        .filter((item) => item.ordinal < allocation.ordinal)
        .reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = cumulativeTaxDelta(totalTax, allocation.refund.amount, allocatedBefore, allocation.amount);
      const metadata = outputTaxMetadata(allocation.refund.lines);
      const accountingEntry = await postPaymentEntryOnTx(tx, {
        payment, idempotencyKey: key, point: payment.point, actor,
        receivedBy: allocation.refund.requester,
        tax: { ...metadata, taxAmount },
      });

      if (allocation.methodSnapshot === 'gift_card') {
        const giftCardId = allocation.originalPayment.giftCardId;
        if (!giftCardId) throw new ConflictError('giftcard_payment_unlinked', 'Исходный gift-card платёж не связан с картой');
        await tx.$queryRaw`SELECT id FROM "GiftCard" WHERE id = ${giftCardId} FOR UPDATE`;
        const currentCard = await tx.giftCard.findUniqueOrThrow({ where: { id: giftCardId } });
        const card = await tx.giftCard.update({
          where: { id: giftCardId },
          data: {
            balance: { increment: allocation.amount },
            status: currentCard.status === 'redeemed' ? 'active' : currentCard.status,
          },
        });
        await tx.giftCardTransaction.create({
          data: {
            giftCardId, paymentId: payment.id, refundAllocationId: allocation.id,
            type: 'refund', amount: allocation.amount, balanceAfter: card.balance,
            sourceRef: key, actor,
          },
        });
      }

      const completed = await tx.refundAllocation.update({
        where: { id: allocation.id },
        data: { status: 'succeeded', providerRefundId, refundPaymentId: payment.id, accountingEntryId: accountingEntry.id, lockedAt: null, nextAttemptAt: null },
      });
      const events: AuditInput[] = [
        { type: EventType.PaymentRefunded, actor, payload: { refundId: allocation.refundId, allocationId: allocation.id, originalPaymentId: allocation.originalPaymentId, paymentId: payment.id, amount: allocation.amount, taxAmount }, refs: [allocation.refundId, allocation.refund.returnId, allocation.refund.orderId, allocation.id, payment.id, allocation.originalPaymentId] },
        { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'payment.refund', sourceRef: payment.id }, refs: [accountingEntry.id, payment.id] },
      ];
      if (providerRefundId) {
        events.push({
          type: EventType.RefundProviderSucceeded,
          actor,
          payload: {
            refundId: allocation.refundId,
            allocationId: allocation.id,
            providerRefundId,
            providerReference,
          },
          refs: [allocation.refundId, allocation.id, providerRefundId],
        });
      }
      if (options.extraEvents) events.push(...options.extraEvents);
      const remaining = await tx.refundAllocation.count({ where: { refundId: allocation.refundId, status: { not: 'succeeded' } } });
      if (remaining === 0) await this.completeRefundOnTx(tx, allocation.refund, payment.id, actor, events);
      else await tx.refund.update({ where: { id: allocation.refundId }, data: { status: 'processing' } });
      return { result: completed, events };
    });
  }

  private async completeRefundOnTx(
    tx: Prisma.TransactionClient,
    refund: Prisma.RefundGetPayload<{ include: { lines: true; allocations: true; order: { include: { items: true } } } }>,
    paymentId: string,
    actor: string,
    events: AuditInput[],
  ) {
    await tx.refund.update({ where: { id: refund.id }, data: { status: 'succeeded', completedAt: new Date() } });
    const first = await tx.refundAllocation.findFirst({ where: { refundId: refund.id }, orderBy: { ordinal: 'asc' }, select: { refundPaymentId: true } });
    const primaryPaymentId = first?.refundPaymentId ?? paymentId;
    await tx.return.update({ where: { id: refund.returnId }, data: { status: 'paid' } });
    await applyCampaignRefundOnTx(tx, { orderId: refund.orderId, refundPaymentId: primaryPaymentId, returnId: refund.returnId, amount: refund.amount, actor }, events);
    await reconcileRefundLoyaltyOnTx(tx, { order: refund.order, refundPaymentId: primaryPaymentId, actor }, events);
    const net = await tx.payment.aggregate({ where: { orderId: refund.orderId }, _sum: { amount: true } });
    if ((net._sum.amount ?? 0) <= 0 && canTransition(refund.order.status, 'refunded')) {
      await tx.order.update({ where: { id: refund.orderId }, data: { status: 'refunded' } });
      events.push({ type: 'order.refunded', actor, payload: { orderId: refund.orderId, refundId: refund.id }, refs: [refund.orderId, refund.id] });
    }
    events.push({ type: 'refund.succeeded', actor, payload: { refundId: refund.id, returnId: refund.returnId, amount: refund.amount }, refs: [refund.id, refund.returnId, refund.orderId] });
    if (this.outbox) {
      await enqueueConsentedCustomerNotice(tx, this.outbox, {
        customerId: refund.order.customerId,
        template: 'refund_succeeded',
        payload: { refundId: refund.id, returnId: refund.returnId, orderId: refund.orderId, amount: refund.amount },
        transactional: true,
      });
    }
  }

  private async completeIfReady(refundId: string, actor: string) {
    await this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { lines: true, allocations: { orderBy: { ordinal: 'asc' } }, order: { include: { items: true } } },
      });
      if (!refund || refund.status === 'succeeded') return { result: refund, events: [] };
      if (refund.allocations.length === 0 || refund.allocations.some((allocation) => allocation.status !== 'succeeded')) {
        return { result: refund, events: [] };
      }
      const paymentId = refund.allocations.find((allocation) => allocation.refundPaymentId)?.refundPaymentId;
      if (!paymentId) throw new ConflictError('refund_payment_missing', 'Исполненный refund не связан с платёжным движением');
      const events: AuditInput[] = [];
      await this.completeRefundOnTx(tx, refund, paymentId, actor, events);
      return { result: refund, events };
    });
  }

  private async assertExecutionShift(tx: Prisma.TransactionClient, shiftId: string | null, requester: string, point: string | null) {
    if (!shiftId) throw new ValidationError('cash_refund_shift_required', 'Для наличного возврата нужна смена');
    await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
    const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.closedAt) throw new ConflictError('cash_refund_shift_closed', 'Смена возврата закрыта');
    if (shift.staffId !== requester) throw new ConflictError('cash_refund_shift_foreign', 'Смена принадлежит другому сотруднику');
    if (point && shift.point !== point) throw new ConflictError('cash_refund_shift_wrong_point', 'Смена открыта в другой точке');
  }

  private async preflightAllocations(
    allocations: Array<{ methodSnapshot: PaymentMethod; shiftId: string | null; originalPaymentId: string }>,
    requester: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const allocation of allocations) {
        const payment = await tx.payment.findUnique({ where: { id: allocation.originalPaymentId } });
        if (!payment) throw new ValidationError('refund_payment_not_found', 'Исходный платёж не найден');
        if (PROVIDER_METHODS.has(allocation.methodSnapshot) && !payment.txnId) {
          throw new ValidationError('provider_txn_missing', 'У исходного платежа нет provider txnId');
        }
        if (allocation.methodSnapshot === 'gift_card' && !payment.giftCardId) {
          throw new ConflictError('giftcard_payment_unlinked', 'Исходный gift-card платёж не связан с картой');
        }
        if (allocation.methodSnapshot === 'cash') {
          await this.assertExecutionShift(tx, allocation.shiftId, requester, payment.point);
        }
      }
    });
  }

  private async markProviderPending(allocationId: string, actor: string, providerRefundId: string, claimAttempt: number) {
    await this.audit.transaction(async (tx) => {
      const claimed = await tx.refundAllocation.updateMany({
        where: { id: allocationId, status: 'processing', attempts: claimAttempt },
        data: { status: 'provider_pending', providerRefundId, lockedAt: null, nextAttemptAt: null },
      });
      const allocation = await tx.refundAllocation.findUniqueOrThrow({ where: { id: allocationId } });
      if (claimed.count === 0) return { result: allocation, events: [] };
      await tx.refund.update({ where: { id: allocation.refundId }, data: { status: 'processing' } });
      return {
        result: allocation,
        events: [{
          type: EventType.RefundProviderPending,
          actor,
          payload: { refundId: allocation.refundId, allocationId, providerRefundId, attempts: allocation.attempts },
          refs: [allocation.refundId, allocationId],
        }],
      };
    });
  }

  /** Customer-facing failure notice for a refund that flipped to terminal `failed`. */
  private async notifyRefundFailedOnTx(tx: Prisma.TransactionClient, refundId: string) {
    if (!this.outbox) return;
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { order: { select: { customerId: true } } },
    });
    if (!refund) return;
    await enqueueConsentedCustomerNotice(tx, this.outbox, {
      customerId: refund.order.customerId,
      template: 'refund_failed',
      payload: { refundId, returnId: refund.returnId, orderId: refund.orderId, amount: refund.amount },
      transactional: true,
    });
  }

  private async recordFailure(allocationId: string, refundId: string, message: string, actor: string, attempts: number) {
    await this.audit.transaction(async (tx) => {
      const changed = await tx.refundAllocation.updateMany({
        where: { id: allocationId, status: 'processing', attempts },
        data: { status: 'failed', lastError: message, lockedAt: null, nextAttemptAt: nextRefundAttempt(attempts) },
      });
      const allocation = await tx.refundAllocation.findUniqueOrThrow({ where: { id: allocationId } });
      if (changed.count === 0) {
        return { result: await tx.refund.findUniqueOrThrow({ where: { id: refundId } }), events: [] };
      }
      const succeeded = await tx.refundAllocation.count({ where: { refundId, status: 'succeeded' } });
      const status = succeeded > 0 ? 'partially_succeeded' as const : 'failed' as const;
      const refund = await tx.refund.update({ where: { id: refundId }, data: { status } });
      if (status === 'failed') await this.notifyRefundFailedOnTx(tx, refundId);
      return {
        result: refund,
        events: [{
          type: EventType.RefundFailed,
          actor,
          payload: {
            refundId,
            allocationId,
            attempts: allocation.attempts || attempts,
            errorClass: classifyRefundError(message),
          },
          refs: [refundId, allocationId],
        }],
      };
    });
  }

  private async deferPreflightFailure(refundId: string, error: unknown, actor: string) {
    const candidate = await this.prisma.refundAllocation.findFirst({
      where: {
        refundId,
        status: { in: ['queued', 'failed'] },
        attempts: { lt: MAX_REFUND_ATTEMPTS },
      },
      orderBy: { ordinal: 'asc' },
      select: { id: true },
    });
    if (!candidate) return;
    const claimed = await this.prisma.refundAllocation.updateMany({
      where: {
        id: candidate.id,
        status: { in: ['queued', 'failed'] },
        attempts: { lt: MAX_REFUND_ATTEMPTS },
      },
      data: { status: 'processing', attempts: { increment: 1 }, lockedAt: new Date(), nextAttemptAt: null },
    });
    if (claimed.count === 0) return;
    const allocation = await this.prisma.refundAllocation.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { attempts: true },
    });
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'unknown_refund_error';
    await this.recordFailure(candidate.id, refundId, message, actor, allocation.attempts);
  }
}

function executionPriority(method: PaymentMethod) {
  if (PROVIDER_METHODS.has(method)) return 0;
  if (method === 'gift_card') return 1;
  return method === 'cash' ? 2 : 3;
}

function classifyRefundError(message: string) {
  if (message.includes('shift')) return 'cash_shift';
  if (message.includes('provider') || message.includes('gateway')) return 'provider';
  if (message.includes('gift')) return 'gift_card';
  return 'domain';
}
