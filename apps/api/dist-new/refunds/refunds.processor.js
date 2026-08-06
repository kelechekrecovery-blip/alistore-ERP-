"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RefundProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundProcessor = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const campaign_refund_adjustment_1 = require("../campaigns/campaign-refund-adjustment");
const errors_1 = require("../common/errors");
const loyalty_ledger_1 = require("../customers/loyalty-ledger");
const accounting_journal_1 = require("../finance/accounting-journal");
const sales_tax_1 = require("../finance/sales-tax");
const order_state_machine_1 = require("../orders/order-state-machine");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const payment_gateway_provider_1 = require("../payments/payment-gateway-provider");
const prisma_service_1 = require("../prisma/prisma.service");
const refunds_constants_1 = require("./refunds.constants");
const PROVIDER_METHODS = new Set(['card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment']);
const RETRYABLE_LAST_ERROR = {
    OR: [
        { lastError: null },
        {
            NOT: {
                OR: [
                    { lastError: { startsWith: refunds_constants_1.PROVIDER_TERMINAL_FAILURE_PREFIX } },
                    { lastError: { startsWith: refunds_constants_1.PROVIDER_PENDING_STALE_PREFIX } },
                ],
            },
        },
    ],
};
let RefundProcessor = RefundProcessor_1 = class RefundProcessor {
    constructor(prisma, audit, gateway, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.gateway = gateway;
        this.outbox = outbox;
        this.logger = new common_1.Logger(RefundProcessor_1.name);
    }
    async processRefund(refundId, actor = 'system:refund-worker', payer) {
        const aggregate = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { allocations: { orderBy: { ordinal: 'asc' } } } });
        if (!aggregate)
            throw new errors_1.ValidationError('refund_not_found', 'Refund не найден');
        if (!['approved', 'processing', 'partially_succeeded', 'failed'].includes(aggregate.status)) {
            if (aggregate.status === 'succeeded')
                return;
            throw new errors_1.ConflictError('refund_not_approved', `Refund имеет статус ${aggregate.status}`);
        }
        try {
            if (aggregate.allocations.some((allocation) => PROVIDER_METHODS.has(allocation.methodSnapshot) && ['queued', 'failed'].includes(allocation.status))) {
                this.gateway.assertOperational();
            }
            const payoutStaffId = payer ? actor : aggregate.requester;
            if (payer)
                await this.reassignCashAllocations(aggregate.id, actor, payer.shiftId);
            const pending = payer
                ? await this.prisma.refundAllocation.findMany({ where: { refundId: aggregate.id }, orderBy: { ordinal: 'asc' } })
                : aggregate.allocations;
            await this.preflightAllocations(pending.filter((allocation) => !['succeeded', 'provider_pending'].includes(allocation.status)), payoutStaffId);
        }
        catch (error) {
            await this.deferPreflightFailure(aggregate.id, error, actor);
            throw error;
        }
        const executionOrder = [...aggregate.allocations].sort((left, right) => executionPriority(left.methodSnapshot) - executionPriority(right.methodSnapshot) || left.ordinal - right.ordinal);
        for (const allocation of executionOrder) {
            if (allocation.status === 'succeeded')
                continue;
            if (allocation.status === 'provider_pending')
                return;
            const processed = await this.processAllocation(allocation.id, actor);
            if (!processed)
                return;
            const current = await this.prisma.refundAllocation.findUnique({
                where: { id: allocation.id },
                select: { status: true },
            });
            if (current?.status !== 'succeeded')
                return;
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
                        attempts: { lt: refunds_constants_1.MAX_REFUND_ATTEMPTS },
                        AND: [
                            RETRYABLE_LAST_ERROR,
                            { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
                        ],
                    },
                    none: {
                        status: { in: ['queued', 'failed'] },
                        OR: [
                            { attempts: { gte: refunds_constants_1.MAX_REFUND_ATTEMPTS } },
                            { nextAttemptAt: { gt: new Date() } },
                            { lastError: { startsWith: refunds_constants_1.PROVIDER_TERMINAL_FAILURE_PREFIX } },
                            { lastError: { startsWith: refunds_constants_1.PROVIDER_PENDING_STALE_PREFIX } },
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
            }
            catch (error) {
                const errorClass = classifyRefundError(error instanceof Error ? error.message : 'unknown_refund_error');
                this.logger.warn(`Refund ${row.id} deferred after ${errorClass} failure`);
            }
        }
        return rows.length;
    }
    async processAllocation(id, actor) {
        const candidate = await this.prisma.refundAllocation.findUnique({
            where: { id },
            select: { originalPaymentId: true, amount: true, attempts: true, nextAttemptAt: true },
        });
        if (!candidate)
            return false;
        if (candidate.attempts >= refunds_constants_1.MAX_REFUND_ATTEMPTS) {
            throw new errors_1.ConflictError('refund_retry_exhausted', 'Лимит автоматических попыток исчерпан; нужна сверка оператора');
        }
        if (candidate.nextAttemptAt && candidate.nextAttemptAt > new Date())
            return false;
        await this.assertTenderCapacity(id, candidate.originalPaymentId, candidate.amount);
        const claimed = await this.prisma.refundAllocation.updateMany({
            where: {
                id,
                status: { in: ['queued', 'failed'] },
                attempts: { lt: refunds_constants_1.MAX_REFUND_ATTEMPTS },
                AND: [
                    RETRYABLE_LAST_ERROR,
                    { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
                ],
            },
            data: { status: 'processing', attempts: { increment: 1 }, lockedAt: new Date(), nextAttemptAt: null, lastError: null },
        });
        if (claimed.count === 0)
            return false;
        const allocation = await this.prisma.refundAllocation.findUnique({
            where: { id }, include: { refund: true, originalPayment: true },
        });
        if (!allocation)
            return false;
        const claimAttempt = allocation.attempts;
        try {
            let providerRefundId = null;
            if (PROVIDER_METHODS.has(allocation.methodSnapshot)) {
                await this.assertTenderCapacity(allocation.id, allocation.originalPaymentId, allocation.amount);
                if (!allocation.originalPayment.txnId)
                    throw new errors_1.ValidationError('provider_txn_missing', 'У исходного платежа нет provider txnId');
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 1000) : 'unknown_refund_error';
            await this.recordFailure(id, allocation.refundId, message, actor, claimAttempt);
            throw error;
        }
    }
    async sweepStaleProviderPending(staleMs = refunds_constants_1.DEFAULT_PROVIDER_PENDING_STALE_MS, limit = 25, actor = 'system:refund-stale-sweep') {
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
            }
            catch (error) {
                this.logger.warn(`Stale sweep skipped refund allocation ${allocation.id}: ${error instanceof Error ? error.message : error}`);
            }
        }
        return swept;
    }
    async markProviderPendingStale(allocationId, refundId, providerRefundId, staleMs, actor) {
        return this.audit.transaction(async (tx) => {
            const changed = await tx.refundAllocation.updateMany({
                where: { id: allocationId, status: 'provider_pending' },
                data: {
                    status: 'failed',
                    lastError: `${refunds_constants_1.PROVIDER_PENDING_STALE_PREFIX}${staleMs}`,
                    lockedAt: null,
                    nextAttemptAt: null,
                },
            });
            if (changed.count === 0)
                return { result: false, events: [] };
            const succeeded = await tx.refundAllocation.count({ where: { refundId, status: 'succeeded' } });
            await tx.refund.update({
                where: { id: refundId },
                data: { status: succeeded > 0 ? 'partially_succeeded' : 'failed' },
            });
            return {
                result: true,
                events: [{
                        type: event_types_1.EventType.RefundProviderStale,
                        actor,
                        payload: { refundId, allocationId, providerRefundId, staleMs },
                        refs: [refundId, allocationId, providerRefundId].filter((ref) => Boolean(ref)),
                    }],
            };
        });
    }
    async reconcileProviderRefund(payload, actor) {
        const allocation = await this.prisma.refundAllocation.findUnique({
            where: { providerRefundId: payload.providerRefundId },
            include: { refund: true },
        });
        if (!allocation)
            throw new errors_1.ValidationError('provider_refund_not_found', 'Provider refund не найден');
        if (allocation.status === 'succeeded')
            return;
        if (allocation.status === 'failed' && (0, refunds_constants_1.isStaleProviderPendingFailure)(allocation.lastError)) {
            const restored = await this.prisma.refundAllocation.updateMany({
                where: {
                    id: allocation.id,
                    status: 'failed',
                    lastError: { startsWith: refunds_constants_1.PROVIDER_PENDING_STALE_PREFIX },
                },
                data: { status: 'provider_pending', lastError: null },
            });
            if (restored.count > 0)
                allocation.status = 'provider_pending';
        }
        if (allocation.status === 'failed') {
            const verifiedFailure = await this.prisma.auditEvent.findFirst({
                where: { type: event_types_1.EventType.RefundProviderFailed, refs: { has: allocation.id } },
                select: { id: true },
            });
            if (verifiedFailure)
                return;
        }
        if (allocation.status !== 'provider_pending') {
            throw new errors_1.ConflictError('provider_refund_not_pending', `Аллокация имеет статус ${allocation.status}`);
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
                if (changed.count === 0)
                    return { result: current, events: [] };
                const succeeded = await tx.refundAllocation.count({ where: { refundId: allocation.refundId, status: 'succeeded' } });
                await tx.refund.update({
                    where: { id: allocation.refundId },
                    data: { status: succeeded > 0 ? 'partially_succeeded' : 'failed' },
                });
                await this.projectRefundFailedOnTx(tx, allocation.refundId);
                return {
                    result: current,
                    events: [{
                            type: event_types_1.EventType.RefundProviderFailed,
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
        await this.finalize(allocation.id, allocation.refundId, actor, payload.providerRefundId, allocation.attempts, payload.providerReference ?? null, 'provider_pending');
        await this.processRefund(allocation.refundId, actor);
    }
    async resolveRefund(refundId, dto, actor, idempotencyKey) {
        if (dto.action !== 'confirm' && dto.action !== 'cancel') {
            throw new errors_1.ValidationError('refund_resolve_action_invalid', 'Действие resolve должно быть confirm или cancel');
        }
        const reason = dto.reason.trim();
        const providerReference = dto.providerReference?.trim() || null;
        const requestHash = (0, node_crypto_1.createHash)('sha256')
            .update(JSON.stringify({ id: refundId, action: dto.action, reason, providerReference }))
            .digest('hex');
        const idempotencyRef = `idempotency:${idempotencyKey}`;
        const replay = await this.prisma.auditEvent.findFirst({
            where: { type: event_types_1.EventType.RefundResolved, refs: { has: idempotencyRef } },
        });
        if (replay) {
            if (!replay.refs.includes(refundId))
                throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован для другого возврата');
            if (replay.payload.requestHash !== requestHash) {
                throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
            }
            return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
        }
        if (dto.action === 'cancel') {
            return this.resolveCancel(refundId, reason, actor, requestHash, idempotencyRef);
        }
        return this.resolveConfirm(refundId, reason, providerReference, actor, requestHash, idempotencyRef);
    }
    async resolveConfirm(refundId, reason, providerReference, actor, requestHash, idempotencyRef) {
        const replayed = await this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'refund-resolve:' + idempotencyRef}))::text AS locked`;
            const replay = await tx.auditEvent.findFirst({
                where: { type: event_types_1.EventType.RefundResolved, refs: { has: idempotencyRef } },
            });
            if (replay && (!replay.refs.includes(refundId) || replay.payload.requestHash !== requestHash)) {
                throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
            }
            return { result: Boolean(replay), events: [] };
        });
        if (replayed)
            return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
        const refund = await this.prisma.refund.findUnique({
            where: { id: refundId },
            include: { allocations: { orderBy: { ordinal: 'asc' } } },
        });
        if (!refund)
            throw new errors_1.ValidationError('refund_not_found', 'Refund не найден');
        if (!['processing', 'partially_succeeded', 'failed'].includes(refund.status)) {
            throw new errors_1.ConflictError('refund_not_resolvable', `Подтверждение без callback возможно только для зависшего исполнения, текущий статус ${refund.status}`);
        }
        const resolvable = refund.allocations.filter((allocation) => allocation.status === 'provider_pending'
            || (allocation.status === 'failed' && (0, refunds_constants_1.isStaleProviderPendingFailure)(allocation.lastError)));
        if (resolvable.length === 0) {
            throw new errors_1.ConflictError('refund_not_resolvable', 'Нет аллокаций, ожидающих provider callback');
        }
        if (resolvable.some((allocation) => !allocation.providerRefundId)) {
            throw new errors_1.ConflictError('provider_refund_missing', 'Аллокация не имеет provider refund для подтверждения');
        }
        let first = true;
        for (const allocation of resolvable) {
            await this.finalize(allocation.id, refundId, actor, allocation.providerRefundId, allocation.attempts, first ? providerReference : null, 'provider_pending', {
                restoreStaleFailure: true,
                extraEvents: first ? [{
                        type: event_types_1.EventType.RefundResolved,
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
                        refs: [refundId, refund.returnId, refund.orderId, idempotencyRef, ...resolvable.map((item) => item.id)]
                            .filter((ref) => Boolean(ref)),
                    }] : undefined,
            });
            first = false;
        }
        await this.processRefund(refundId, actor);
        return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    }
    async resolveCancel(refundId, reason, actor, requestHash, idempotencyRef) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'refund-resolve:' + idempotencyRef}))::text AS locked`;
            const replay = await tx.auditEvent.findFirst({
                where: { type: event_types_1.EventType.RefundResolved, refs: { has: idempotencyRef } },
            });
            if (replay) {
                if (!replay.refs.includes(refundId) || replay.payload.requestHash !== requestHash) {
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
                }
                return { result: await tx.refund.findUniqueOrThrow({ where: { id: refundId } }), events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
            const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { allocations: true } });
            if (!refund)
                throw new errors_1.ValidationError('refund_not_found', 'Refund не найден');
            if (!['processing', 'failed'].includes(refund.status)) {
                throw new errors_1.ConflictError('refund_not_resolvable', `Отмена без callback возможна только для зависшего исполнения, текущий статус ${refund.status}`);
            }
            if (refund.allocations.some((allocation) => ['processing', 'succeeded'].includes(allocation.status))) {
                throw new errors_1.ConflictError('refund_reconciliation_required', 'Есть исполняемая или подтверждённая аллокация; нужна финансовая сверка');
            }
            const cancellable = refund.allocations.filter((allocation) => ['queued', 'provider_pending', 'failed'].includes(allocation.status));
            if (cancellable.length === 0) {
                throw new errors_1.ConflictError('refund_not_resolvable', 'Нет аллокаций для отмены');
            }
            await tx.refundAllocation.updateMany({
                where: { refundId, status: { in: ['queued', 'provider_pending', 'failed'] } },
                data: { status: 'failed', lastError: `operator_cancelled:${reason}`, lockedAt: null, nextAttemptAt: null },
            });
            const result = await tx.refund.update({ where: { id: refundId }, data: { status: 'rejected' } });
            if (refund.returnId) {
                await tx.return.update({ where: { id: refund.returnId }, data: { status: 'rejected' } });
            }
            else {
                await tx.orderCancellation.updateMany({
                    where: { refundId: refund.id },
                    data: { status: 'refund_failed' },
                });
            }
            return {
                result,
                events: [{
                        type: event_types_1.EventType.RefundResolved,
                        actor,
                        payload: {
                            refundId,
                            action: 'cancelled',
                            reason,
                            requestHash,
                            allocationIds: cancellable.map((allocation) => allocation.id),
                            withoutProviderCallback: true,
                        },
                        refs: [refundId, refund.returnId, refund.orderId, idempotencyRef, ...cancellable.map((allocation) => allocation.id)]
                            .filter((ref) => Boolean(ref)),
                    }],
            };
        });
    }
    async assertTenderCapacity(allocationId, originalPaymentId, amount) {
        await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Payment" WHERE id = ${originalPaymentId} FOR UPDATE`;
            const payment = await tx.payment.findUnique({ where: { id: originalPaymentId } });
            if (!payment || payment.amount <= 0) {
                throw new errors_1.ValidationError('refund_payment_not_found', 'Исходный платёж не найден');
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
                throw new errors_1.ConflictError('refund_exceeds_tender', 'Возврат превышает доступный остаток исходного платежа');
            }
        });
    }
    async finalize(allocationId, refundId, actor, providerRefundId, claimAttempt, providerReference = null, expectedStatus = 'processing', options = {}) {
        return this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
            await tx.$queryRaw `SELECT id FROM "RefundAllocation" WHERE id = ${allocationId} FOR UPDATE`;
            const allocation = await tx.refundAllocation.findUnique({
                where: { id: allocationId },
                include: {
                    refund: { include: { lines: true, allocations: { orderBy: { ordinal: 'asc' } }, order: { include: { items: true } } } },
                    originalPayment: true,
                },
            });
            if (!allocation)
                throw new errors_1.ValidationError('refund_allocation_not_found', 'Аллокация возврата не найдена');
            if (allocation.status === 'succeeded')
                return { result: allocation, events: [] };
            if (allocation.attempts !== claimAttempt)
                return { result: allocation, events: [] };
            if (options.restoreStaleFailure && allocation.status === 'failed' && (0, refunds_constants_1.isStaleProviderPendingFailure)(allocation.lastError)) {
                await tx.refundAllocation.update({
                    where: { id: allocationId },
                    data: { status: 'provider_pending', lastError: null },
                });
                allocation.status = 'provider_pending';
                allocation.lastError = null;
            }
            if (allocation.status !== expectedStatus) {
                throw new errors_1.ConflictError('refund_allocation_not_claimed', 'Аллокация не находится в ожидаемом состоянии исполнения');
            }
            if (expectedStatus === 'provider_pending' && allocation.providerRefundId !== providerRefundId) {
                throw new errors_1.ConflictError('provider_refund_mismatch', 'Provider refund не соответствует аллокации');
            }
            if (allocation.refund.status === 'rejected')
                throw new errors_1.ConflictError('refund_rejected', 'Refund отклонён');
            await tx.$queryRaw `SELECT id FROM "Payment" WHERE id = ${allocation.originalPaymentId} FOR UPDATE`;
            const prior = await tx.payment.aggregate({ where: { originalPaymentId: allocation.originalPaymentId }, _sum: { amount: true } });
            if (allocation.amount > allocation.originalPayment.amount + (prior._sum.amount ?? 0)) {
                throw new errors_1.ConflictError('refund_exceeds_tender', 'Возврат превышает остаток исходного платежа');
            }
            const payoutBy = allocation.methodSnapshot === 'cash' && allocation.shiftId
                ? (await tx.cashShift.findUnique({ where: { id: allocation.shiftId } }))?.staffId ?? allocation.refund.requester
                : allocation.refund.requester;
            if (allocation.methodSnapshot === 'cash') {
                await this.assertExecutionShift(tx, allocation.shiftId, payoutBy, allocation.originalPayment.point);
            }
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
                    receivedBy: payoutBy,
                    point: allocation.originalPayment.point,
                },
            });
            const prepaymentRefund = allocation.refund.purpose === 'customer_prepayment';
            const totalTax = prepaymentRefund
                ? 0
                : allocation.refund.lines.reduce((sum, line) => sum + line.taxAmount, 0);
            const allocatedBefore = allocation.refund.allocations
                .filter((item) => item.ordinal < allocation.ordinal)
                .reduce((sum, item) => sum + item.amount, 0);
            const taxAmount = (0, sales_tax_1.cumulativeTaxDelta)(totalTax, allocation.refund.amount, allocatedBefore, allocation.amount);
            const accountingEntry = prepaymentRefund
                ? await (0, accounting_journal_1.postCustomerPrepaymentRefundOnTx)(tx, {
                    payment,
                    idempotencyKey: key,
                    point: payment.point,
                    actor,
                    receivedBy: payoutBy,
                })
                : await (0, accounting_journal_1.postPaymentEntryOnTx)(tx, {
                    payment,
                    idempotencyKey: key,
                    point: payment.point,
                    actor,
                    receivedBy: payoutBy,
                    tax: { ...(0, sales_tax_1.outputTaxMetadata)(allocation.refund.lines), taxAmount },
                });
            if (allocation.methodSnapshot === 'gift_card') {
                const giftCardId = allocation.originalPayment.giftCardId;
                if (!giftCardId)
                    throw new errors_1.ConflictError('giftcard_payment_unlinked', 'Исходный gift-card платёж не связан с картой');
                await tx.$queryRaw `SELECT id FROM "GiftCard" WHERE id = ${giftCardId} FOR UPDATE`;
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
            const events = [
                {
                    type: event_types_1.EventType.PaymentRefunded,
                    actor,
                    payload: {
                        refundId: allocation.refundId,
                        allocationId: allocation.id,
                        originalPaymentId: allocation.originalPaymentId,
                        paymentId: payment.id,
                        amount: allocation.amount,
                        taxAmount,
                        purpose: allocation.refund.purpose,
                    },
                    refs: [
                        allocation.refundId,
                        allocation.refund.returnId,
                        allocation.refund.orderId,
                        allocation.id,
                        payment.id,
                        allocation.originalPaymentId,
                    ].filter((ref) => Boolean(ref)),
                },
                { type: event_types_1.EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accountingEntry.id, sourceType: 'payment.refund', sourceRef: payment.id }, refs: [accountingEntry.id, payment.id] },
            ];
            if (providerRefundId) {
                events.push({
                    type: event_types_1.EventType.RefundProviderSucceeded,
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
            if (options.extraEvents)
                events.push(...options.extraEvents);
            const remaining = await tx.refundAllocation.count({ where: { refundId: allocation.refundId, status: { not: 'succeeded' } } });
            if (remaining === 0)
                await this.completeRefundOnTx(tx, allocation.refund, payment.id, actor, events);
            else
                await tx.refund.update({ where: { id: allocation.refundId }, data: { status: 'processing' } });
            return { result: completed, events };
        });
    }
    async completeRefundOnTx(tx, refund, paymentId, actor, events) {
        await tx.refund.update({ where: { id: refund.id }, data: { status: 'succeeded', completedAt: new Date() } });
        const first = await tx.refundAllocation.findFirst({ where: { refundId: refund.id }, orderBy: { ordinal: 'asc' }, select: { refundPaymentId: true } });
        const primaryPaymentId = first?.refundPaymentId ?? paymentId;
        if (refund.purpose === 'customer_prepayment') {
            await tx.orderCancellation.updateMany({
                where: { refundId: refund.id },
                data: { status: 'refunded', completedAt: new Date() },
            });
        }
        else {
            if (!refund.returnId) {
                throw new errors_1.ConflictError('refund_return_missing', 'Возврат продажи не связан с Return');
            }
            await tx.return.update({ where: { id: refund.returnId }, data: { status: 'paid' } });
            await (0, campaign_refund_adjustment_1.applyCampaignRefundOnTx)(tx, {
                orderId: refund.orderId,
                refundPaymentId: primaryPaymentId,
                returnId: refund.returnId,
                amount: refund.amount,
                actor,
            }, events);
            await (0, loyalty_ledger_1.reconcileRefundLoyaltyOnTx)(tx, {
                order: refund.order,
                refundPaymentId: primaryPaymentId,
                actor,
            }, events);
        }
        const net = await tx.payment.aggregate({ where: { orderId: refund.orderId }, _sum: { amount: true } });
        if ((net._sum.amount ?? 0) <= 0 && (0, order_state_machine_1.canTransition)(refund.order.status, 'refunded')) {
            await tx.order.update({ where: { id: refund.orderId }, data: { status: 'refunded' } });
            events.push({ type: 'order.refunded', actor, payload: { orderId: refund.orderId, refundId: refund.id }, refs: [refund.orderId, refund.id] });
        }
        events.push({
            type: 'refund.succeeded',
            actor,
            payload: {
                refundId: refund.id,
                returnId: refund.returnId,
                amount: refund.amount,
                purpose: refund.purpose,
            },
            refs: [refund.id, refund.returnId, refund.orderId]
                .filter((ref) => Boolean(ref)),
        });
        if (this.outbox) {
            if (refund.purpose === 'customer_prepayment') {
                await (0, customer_notifications_1.enqueueSupplyCustomerNotice)(tx, this.outbox, {
                    customerId: refund.order.customerId,
                    template: 'supply_refund_completed',
                    eventKey: refund.id,
                    payload: { refundId: refund.id, orderId: refund.orderId, amount: refund.amount },
                });
            }
            else {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: refund.order.customerId,
                    template: 'refund_succeeded',
                    payload: { refundId: refund.id, returnId: refund.returnId, orderId: refund.orderId, amount: refund.amount },
                    transactional: true,
                    dedupKey: `refund_succeeded:${refund.id}`,
                });
            }
        }
    }
    async completeIfReady(refundId, actor) {
        await this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
            const refund = await tx.refund.findUnique({
                where: { id: refundId },
                include: { lines: true, allocations: { orderBy: { ordinal: 'asc' } }, order: { include: { items: true } } },
            });
            if (!refund || refund.status === 'succeeded')
                return { result: refund, events: [] };
            if (refund.allocations.length === 0 || refund.allocations.some((allocation) => allocation.status !== 'succeeded')) {
                return { result: refund, events: [] };
            }
            const paymentId = refund.allocations.find((allocation) => allocation.refundPaymentId)?.refundPaymentId;
            if (!paymentId)
                throw new errors_1.ConflictError('refund_payment_missing', 'Исполненный refund не связан с платёжным движением');
            const events = [];
            await this.completeRefundOnTx(tx, refund, paymentId, actor, events);
            return { result: refund, events };
        });
    }
    async reassignCashAllocations(refundId, staffId, shiftId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
            const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
            if (!shift || shift.closedAt)
                throw new errors_1.ConflictError('cash_refund_shift_closed', 'Смена выплаты закрыта или не найдена');
            if (shift.staffId !== staffId)
                throw new errors_1.ConflictError('cash_refund_shift_foreign', 'Смена принадлежит другому сотруднику');
            await tx.refundAllocation.updateMany({
                where: { refundId, methodSnapshot: 'cash', status: { notIn: ['succeeded', 'provider_pending'] } },
                data: { shiftId },
            });
        });
    }
    async assertExecutionShift(tx, shiftId, requester, point) {
        if (!shiftId)
            throw new errors_1.ValidationError('cash_refund_shift_required', 'Для наличного возврата нужна смена');
        await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
        const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
        if (!shift || shift.closedAt)
            throw new errors_1.ConflictError('cash_refund_shift_closed', 'Смена возврата закрыта');
        if (shift.staffId !== requester)
            throw new errors_1.ConflictError('cash_refund_shift_foreign', 'Смена принадлежит другому сотруднику');
        if (point && shift.point !== point)
            throw new errors_1.ConflictError('cash_refund_shift_wrong_point', 'Смена открыта в другой точке');
    }
    async preflightAllocations(allocations, requester) {
        await this.prisma.$transaction(async (tx) => {
            for (const allocation of allocations) {
                const payment = await tx.payment.findUnique({ where: { id: allocation.originalPaymentId } });
                if (!payment)
                    throw new errors_1.ValidationError('refund_payment_not_found', 'Исходный платёж не найден');
                if (PROVIDER_METHODS.has(allocation.methodSnapshot) && !payment.txnId) {
                    throw new errors_1.ValidationError('provider_txn_missing', 'У исходного платежа нет provider txnId');
                }
                if (allocation.methodSnapshot === 'gift_card' && !payment.giftCardId) {
                    throw new errors_1.ConflictError('giftcard_payment_unlinked', 'Исходный gift-card платёж не связан с картой');
                }
                if (allocation.methodSnapshot === 'cash') {
                    await this.assertExecutionShift(tx, allocation.shiftId, requester, payment.point);
                }
            }
        });
    }
    async markProviderPending(allocationId, actor, providerRefundId, claimAttempt) {
        await this.audit.transaction(async (tx) => {
            const claimed = await tx.refundAllocation.updateMany({
                where: { id: allocationId, status: 'processing', attempts: claimAttempt },
                data: { status: 'provider_pending', providerRefundId, lockedAt: null, nextAttemptAt: null },
            });
            const allocation = await tx.refundAllocation.findUniqueOrThrow({ where: { id: allocationId } });
            if (claimed.count === 0)
                return { result: allocation, events: [] };
            await tx.refund.update({ where: { id: allocation.refundId }, data: { status: 'processing' } });
            return {
                result: allocation,
                events: [{
                        type: event_types_1.EventType.RefundProviderPending,
                        actor,
                        payload: { refundId: allocation.refundId, allocationId, providerRefundId, attempts: allocation.attempts },
                        refs: [allocation.refundId, allocationId],
                    }],
            };
        });
    }
    async projectRefundFailedOnTx(tx, refundId) {
        const refund = await tx.refund.findUnique({
            where: { id: refundId },
            select: { purpose: true },
        });
        if (refund?.purpose === 'customer_prepayment') {
            await tx.orderCancellation.updateMany({
                where: {
                    refundId,
                    status: { in: ['refund_queued', 'refund_processing'] },
                },
                data: { status: 'refund_failed' },
            });
        }
        await this.notifyRefundFailedOnTx(tx, refundId);
    }
    async notifyRefundFailedOnTx(tx, refundId) {
        if (!this.outbox)
            return;
        const refund = await tx.refund.findUnique({
            where: { id: refundId },
            include: { order: { select: { customerId: true } } },
        });
        if (!refund)
            return;
        if (refund.purpose === 'customer_prepayment') {
            await (0, customer_notifications_1.enqueueSupplyCustomerNotice)(tx, this.outbox, {
                customerId: refund.order.customerId,
                template: 'supply_refund_failed',
                eventKey: refund.id,
                payload: { refundId, orderId: refund.orderId, amount: refund.amount },
            });
        }
        else {
            await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                customerId: refund.order.customerId,
                template: 'refund_failed',
                payload: { refundId, returnId: refund.returnId, orderId: refund.orderId, amount: refund.amount },
                transactional: true,
                dedupKey: `refund_failed:${refund.id}`,
            });
        }
    }
    async recordFailure(allocationId, refundId, message, actor, attempts) {
        await this.audit.transaction(async (tx) => {
            const changed = await tx.refundAllocation.updateMany({
                where: { id: allocationId, status: 'processing', attempts },
                data: {
                    status: 'failed',
                    lastError: message,
                    lockedAt: null,
                    nextAttemptAt: attempts >= refunds_constants_1.MAX_REFUND_ATTEMPTS ? null : (0, refunds_constants_1.nextRefundAttempt)(attempts),
                },
            });
            const allocation = await tx.refundAllocation.findUniqueOrThrow({ where: { id: allocationId } });
            if (changed.count === 0) {
                return { result: await tx.refund.findUniqueOrThrow({ where: { id: refundId } }), events: [] };
            }
            const succeeded = await tx.refundAllocation.count({ where: { refundId, status: 'succeeded' } });
            const status = succeeded > 0 ? 'partially_succeeded' : 'failed';
            const refund = await tx.refund.update({ where: { id: refundId }, data: { status } });
            const exhausted = allocation.status === 'failed'
                && allocation.attempts >= refunds_constants_1.MAX_REFUND_ATTEMPTS
                && allocation.nextAttemptAt === null;
            if (exhausted) {
                await this.projectRefundFailedOnTx(tx, refundId);
            }
            else if (refund.purpose === 'customer_prepayment') {
                await tx.orderCancellation.updateMany({
                    where: {
                        refundId,
                        status: { in: ['refund_queued', 'refund_failed'] },
                    },
                    data: { status: 'refund_processing' },
                });
            }
            return {
                result: refund,
                events: [{
                        type: event_types_1.EventType.RefundFailed,
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
    async deferPreflightFailure(refundId, error, actor) {
        const candidate = await this.prisma.refundAllocation.findFirst({
            where: {
                refundId,
                status: { in: ['queued', 'failed'] },
                attempts: { lt: refunds_constants_1.MAX_REFUND_ATTEMPTS },
            },
            orderBy: { ordinal: 'asc' },
            select: { id: true },
        });
        if (!candidate)
            return;
        const claimed = await this.prisma.refundAllocation.updateMany({
            where: {
                id: candidate.id,
                status: { in: ['queued', 'failed'] },
                attempts: { lt: refunds_constants_1.MAX_REFUND_ATTEMPTS },
            },
            data: { status: 'processing', attempts: { increment: 1 }, lockedAt: new Date(), nextAttemptAt: null },
        });
        if (claimed.count === 0)
            return;
        const allocation = await this.prisma.refundAllocation.findUniqueOrThrow({
            where: { id: candidate.id },
            select: { attempts: true },
        });
        const message = error instanceof Error ? error.message.slice(0, 1000) : 'unknown_refund_error';
        await this.recordFailure(candidate.id, refundId, message, actor, allocation.attempts);
    }
};
exports.RefundProcessor = RefundProcessor;
exports.RefundProcessor = RefundProcessor = RefundProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(payment_gateway_provider_1.PAYMENT_GATEWAY_PROVIDER)),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService, Object, outbox_service_1.OutboxService])
], RefundProcessor);
function executionPriority(method) {
    if (PROVIDER_METHODS.has(method))
        return 0;
    if (method === 'gift_card')
        return 1;
    return method === 'cash' ? 2 : 3;
}
function classifyRefundError(message) {
    if (message.includes('shift'))
        return 'cash_shift';
    if (message.includes('provider') || message.includes('gateway'))
        return 'provider';
    if (message.includes('gift'))
        return 'gift_card';
    return 'domain';
}
//# sourceMappingURL=refunds.processor.js.map