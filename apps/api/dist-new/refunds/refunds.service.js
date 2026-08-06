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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const sales_tax_1 = require("../finance/sales-tax");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const prisma_service_1 = require("../prisma/prisma.service");
const ACTIVE_RESERVATION_STATUSES = [
    'requested', 'approved', 'processing', 'partially_succeeded', 'failed',
];
let RefundsService = class RefundsService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    get(id) {
        return this.prisma.refund.findUnique({
            where: { id },
            include: {
                return: { include: { items: true } },
                approval: true,
                lines: { include: { returnItem: true }, orderBy: { createdAt: 'asc' } },
                allocations: { include: { originalPayment: true, refundPayment: true }, orderBy: { ordinal: 'asc' } },
            },
        });
    }
    async request(returnId, dto, actor, idempotencyKey) {
        const requestHash = (0, node_crypto_1.createHash)('sha256')
            .update(JSON.stringify({ returnId, reason: dto.reason.trim(), shiftId: dto.shiftId ?? null }))
            .digest('hex');
        const refundId = (0, node_crypto_1.randomUUID)();
        const created = await this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'refund:' + idempotencyKey}))::text AS locked`;
            const replay = await tx.refund.findUnique({ where: { idempotencyKey } });
            if (replay) {
                if (replay.requestHash !== requestHash)
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
                return { result: replay, events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "Return" WHERE id = ${returnId} FOR UPDATE`;
            const ret = await tx.return.findUnique({
                where: { id: returnId },
                include: { items: { include: { orderItem: true } }, order: true },
            });
            if (!ret)
                throw new errors_1.ValidationError('return_not_found', 'Возврат не найден');
            if (ret.status !== 'processing')
                throw new errors_1.ConflictError('return_not_processing', `Возврат уже ${ret.status}`);
            if (ret.refundAmount <= 0 || ret.items.length === 0)
                throw new errors_1.ValidationError('refund_amount_invalid', 'В возврате нет оплачиваемых строк');
            const existing = await tx.refund.findUnique({ where: { returnId } });
            if (existing)
                throw new errors_1.ConflictError('return_refund_exists', 'Для возврата уже создан refund');
            const payments = await tx.payment.findMany({
                where: { orderId: ret.orderId, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            for (const payment of payments) {
                await tx.$queryRaw `SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
            }
            const allocations = await this.allocateOnTx(tx, payments, ret.refundAmount);
            const cashAllocation = allocations.find((item) => item.payment.method === 'cash');
            const resolvedShiftId = cashAllocation
                ? await this.assertCashShift(tx, dto.shiftId, actor, cashAllocation.payment)
                : null;
            const approval = await tx.approval.create({
                data: {
                    action: 'refund', requester: actor, reason: dto.reason.trim(), status: 'requested',
                    evidence: { payload: { refundId }, evidence: { returnId, amount: ret.refundAmount } },
                },
            });
            const postedRefundPayments = await tx.payment.findMany({
                where: { orderId: ret.orderId, amount: { lt: 0 } },
                select: { id: true },
            });
            const postedTax = postedRefundPayments.length === 0
                ? 0
                : (await tx.accountingJournalEntry.aggregate({
                    where: {
                        sourceType: 'payment.refund',
                        sourceRef: { in: postedRefundPayments.map(({ id }) => id) },
                    },
                    _sum: { taxAmount: true },
                }))._sum.taxAmount ?? 0;
            let remainingTaxBudget = Math.max(ret.order.taxAmount - postedTax, 0);
            const lines = [];
            const orderedItems = [...ret.items].sort((left, right) => left.orderItemId.localeCompare(right.orderItemId) || left.id.localeCompare(right.id));
            for (const item of orderedItems) {
                const [aggregatePrevious, legacyPrevious] = await Promise.all([
                    tx.refundLine.aggregate({
                        where: {
                            returnItem: { orderItemId: item.orderItemId },
                            refund: { status: { not: 'rejected' } },
                        },
                        _sum: { qty: true },
                    }),
                    tx.returnItem.aggregate({
                        where: {
                            orderItemId: item.orderItemId,
                            return: { status: 'paid' },
                            refundLines: { none: {} },
                        },
                        _sum: { qty: true },
                    }),
                ]);
                const previousQty = (aggregatePrevious._sum.qty ?? 0) + (legacyPrevious._sum.qty ?? 0);
                const itemGross = item.orderItem.price * item.orderItem.qty - item.orderItem.discountAmount;
                const previousGross = Math.floor((itemGross * previousQty) / item.orderItem.qty);
                const cumulativeQty = previousQty + item.qty;
                const afterGross = cumulativeQty === item.orderItem.qty
                    ? itemGross
                    : Math.floor((itemGross * cumulativeQty) / item.orderItem.qty);
                const returnedGross = afterGross - previousGross;
                const itemTaxAmount = (0, sales_tax_1.cumulativeTaxDelta)(item.orderItem.taxAmount, itemGross, previousGross, returnedGross);
                const taxAmount = Math.min(itemTaxAmount, remainingTaxBudget);
                remainingTaxBudget -= taxAmount;
                lines.push({
                    returnItemId: item.id,
                    qty: item.qty,
                    grossAmount: item.refundAmount,
                    taxBaseAmount: item.refundAmount - taxAmount,
                    taxAmount,
                    revenueAmount: item.refundAmount - taxAmount,
                    taxCode: item.orderItem.taxCode,
                    taxRateBps: item.orderItem.taxRateBps,
                });
            }
            const refund = await tx.refund.create({
                data: {
                    id: refundId, returnId, orderId: ret.orderId, approvalId: approval.id,
                    idempotencyKey, requestHash, amount: ret.refundAmount, reason: dto.reason.trim(), requester: actor,
                    lines: { create: lines },
                    allocations: {
                        create: allocations.map((item, ordinal) => ({
                            originalPaymentId: item.payment.id,
                            amount: item.amount,
                            ordinal,
                            methodSnapshot: item.payment.method,
                            shiftId: item.payment.method === 'cash' ? resolvedShiftId : null,
                        })),
                    },
                },
            });
            if (this.outbox) {
                await (0, customer_notifications_1.enqueueStaffNotice)(tx, this.outbox, {
                    template: 'approval_requested',
                    title: 'Нужно согласование',
                    body: `refund · ${dto.reason.trim()}`,
                    payload: { approvalId: approval.id, action: 'refund', refundId, deepLink: `alistore-admin://approvals/${approval.id}` },
                });
            }
            return {
                result: refund,
                events: [
                    { type: event_types_1.EventType.ApprovalRequested, actor, payload: { approvalId: approval.id, action: 'refund', refundId }, refs: [approval.id, refundId, returnId] },
                    { type: event_types_1.EventType.RefundRequested, actor, payload: { refundId, returnId, orderId: ret.orderId, amount: ret.refundAmount }, refs: [refundId, returnId, ret.orderId] },
                ],
            };
        });
        return this.get(created.id);
    }
    async cancel(id, dto, actor, idempotencyKey) {
        const requestHash = (0, node_crypto_1.createHash)('sha256')
            .update(JSON.stringify({ id, reason: dto.reason.trim() }))
            .digest('hex');
        const idempotencyRef = `idempotency:${idempotencyKey}`;
        const cancelled = await this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'refund-cancel:' + idempotencyKey}))::text AS locked`;
            const replay = await tx.auditEvent.findFirst({
                where: { type: event_types_1.EventType.RefundCancelled, refs: { has: idempotencyRef } },
            });
            if (replay) {
                if (!replay.refs.includes(id))
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован для другого возврата');
                const payload = replay.payload;
                if (payload.requestHash !== requestHash) {
                    throw new errors_1.ConflictError('idempotency_key_reused', 'Ключ уже использован с другим запросом');
                }
                return { result: await tx.refund.findUniqueOrThrow({ where: { id } }), events: [] };
            }
            await tx.$queryRaw `SELECT id FROM "Refund" WHERE id = ${id} FOR UPDATE`;
            const refund = await tx.refund.findUnique({ where: { id }, include: { allocations: true } });
            if (!refund)
                throw new errors_1.ValidationError('refund_not_found', 'Refund не найден');
            if (refund.status !== 'failed') {
                throw new errors_1.ConflictError('refund_not_cancellable', 'Отменить можно только неисполненный refund после ошибки');
            }
            if (refund.allocations.some((allocation) => ['processing', 'provider_pending', 'succeeded'].includes(allocation.status))) {
                throw new errors_1.ConflictError('refund_reconciliation_required', 'Есть исполняемая или подтверждённая аллокация; нужна финансовая сверка');
            }
            for (const allocation of refund.allocations) {
                if (!['card', 'qr_mbank', 'qr_odengi', 'bakai_pos', 'obank', 'installment'].includes(allocation.methodSnapshot))
                    continue;
                const verifiedFailure = await tx.auditEvent.findFirst({
                    where: { type: event_types_1.EventType.RefundProviderFailed, refs: { has: allocation.id } },
                    select: { id: true },
                });
                if (!verifiedFailure) {
                    throw new errors_1.ConflictError('refund_reconciliation_required', 'Provider refund не имеет подтверждённого terminal-failure callback');
                }
            }
            await tx.refundAllocation.updateMany({
                where: { refundId: id, status: { in: ['queued', 'failed'] } },
                data: { status: 'failed', lastError: `operator_cancelled:${dto.reason.trim()}`, lockedAt: null, nextAttemptAt: null },
            });
            const result = await tx.refund.update({ where: { id }, data: { status: 'rejected' } });
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
                        type: event_types_1.EventType.RefundCancelled,
                        actor,
                        payload: { refundId: id, reason: dto.reason.trim(), requestHash },
                        refs: [id, refund.returnId, refund.orderId, idempotencyRef]
                            .filter((ref) => Boolean(ref)),
                    }],
            };
        });
        return this.get(cancelled.id);
    }
    async allocateOnTx(tx, payments, amount) {
        const priority = {
            card: 0, qr_mbank: 0, qr_odengi: 0, bakai_pos: 0, obank: 0, installment: 0, gift_card: 1, cash: 2,
        };
        const ordered = [...payments].sort((a, b) => priority[a.method] - priority[b.method] || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
        let remaining = amount;
        const result = [];
        for (const payment of ordered) {
            const [executed, reserved] = await Promise.all([
                tx.payment.aggregate({ where: { originalPaymentId: payment.id }, _sum: { amount: true } }),
                tx.refundAllocation.aggregate({
                    where: { originalPaymentId: payment.id, status: { in: ['queued', 'processing', 'provider_pending', 'failed'] }, refund: { status: { in: ACTIVE_RESERVATION_STATUSES } } },
                    _sum: { amount: true },
                }),
            ]);
            const available = payment.amount + (executed._sum.amount ?? 0) - (reserved._sum.amount ?? 0);
            const allocated = Math.min(Math.max(available, 0), remaining);
            if (allocated > 0)
                result.push({ payment, amount: allocated });
            remaining -= allocated;
            if (remaining === 0)
                break;
        }
        if (remaining > 0)
            throw new errors_1.ValidationError('refund_exceeds_paid', 'Недостаточно доступных исходных платежей для возврата');
        return result;
    }
    async assertCashShift(tx, shiftId, actor, payment) {
        let effectiveId = shiftId?.trim() || undefined;
        if (!effectiveId) {
            const open = await tx.cashShift.findMany({
                where: { staffId: actor, closedAt: null, ...(payment.point ? { point: payment.point } : {}) },
                select: { id: true },
            });
            if (open.length !== 1) {
                throw new errors_1.ValidationError('cash_refund_shift_required', 'Откройте кассовую смену или передайте shiftId');
            }
            effectiveId = open[0].id;
        }
        await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${effectiveId} FOR UPDATE`;
        const shift = await tx.cashShift.findUnique({ where: { id: effectiveId } });
        if (!shift || shift.closedAt)
            throw new errors_1.ConflictError('cash_refund_shift_closed', 'Смена возврата закрыта или не найдена');
        if (shift.staffId !== actor)
            throw new errors_1.ConflictError('cash_refund_shift_foreign', 'Смена принадлежит другому сотруднику');
        if (payment.point && shift.point !== payment.point)
            throw new errors_1.ConflictError('cash_refund_shift_wrong_point', 'Смена открыта в другой точке');
        return effectiveId;
    }
};
exports.RefundsService = RefundsService;
exports.RefundsService = RefundsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], RefundsService);
//# sourceMappingURL=refunds.service.js.map