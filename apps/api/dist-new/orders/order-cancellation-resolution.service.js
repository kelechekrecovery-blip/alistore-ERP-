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
exports.OrderCancellationResolutionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_errors_1 = require("../common/prisma-errors");
const prisma_service_1 = require("../prisma/prisma.service");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const outbox_service_1 = require("../outbox/outbox.service");
const RESOLUTION_SELECT = {
    id: true,
    orderId: true,
    status: true,
    policySnapshot: true,
    purchaseOrderSentSnapshot: true,
    depositPaidSnapshot: true,
    requestedRefundAmount: true,
    approvedRefundAmount: true,
    supplierExpenseAmount: true,
    faultParty: true,
    customerReason: true,
    ownerReason: true,
    evidence: true,
    resolutionAction: true,
    resolvedBy: true,
    refundId: true,
    createdAt: true,
    resolvedAt: true,
    completedAt: true,
};
let OrderCancellationResolutionService = class OrderCancellationResolutionService {
    constructor(prisma, audit, staffAuth, config, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.staffAuth = staffAuth;
        this.config = config;
        this.outbox = outbox;
    }
    async preview(orderId, cancellationId, role) {
        this.assertOwnerRole(role);
        const cancellation = await this.prisma.orderCancellation.findFirst({
            where: { id: cancellationId, orderId },
            select: {
                ...RESOLUTION_SELECT,
                order: {
                    select: {
                        purchaseOrders: {
                            select: { id: true, status: true, sentAt: true },
                            orderBy: { createdAt: 'asc' },
                        },
                    },
                },
            },
        });
        if (!cancellation)
            return null;
        return {
            ...cancellation,
            canResolve: this.enabled()
                && cancellation.policySnapshot === 'owner_resolution'
                && cancellation.purchaseOrderSentSnapshot
                && cancellation.status === 'awaiting_owner',
            fullRefundAmount: cancellation.depositPaidSnapshot,
            partialRefundRules: {
                faultParty: 'customer',
                evidenceRequired: true,
                formula: 'refundAmount = depositPaidSnapshot - supplierExpenseAmount',
            },
        };
    }
    async resolve(orderId, cancellationId, actor, role, input, idempotencyKey, totpToken) {
        this.assertOwnerRole(role);
        if (!this.enabled()) {
            throw new errors_1.ConflictError('supply_cancellation_disabled', 'Контур отмен заказных товаров пока не включён');
        }
        const normalized = normalizeResolution(input);
        const requestHash = hashResolution({ orderId, cancellationId, actor, ...normalized });
        const replay = await this.prisma.orderCancellation.findUnique({
            where: { resolutionIdempotencyKey: idempotencyKey },
            select: {
                ...RESOLUTION_SELECT,
                resolutionIdempotencyKey: true,
                resolutionRequestHash: true,
            },
        });
        if (replay)
            return replayResolution(replay, orderId, cancellationId, requestHash);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'order-cancellation-resolution:' + cancellationId}))::text AS locked`;
                const lockedReplay = await tx.orderCancellation.findUnique({
                    where: { resolutionIdempotencyKey: idempotencyKey },
                    select: {
                        ...RESOLUTION_SELECT,
                        resolutionIdempotencyKey: true,
                        resolutionRequestHash: true,
                    },
                });
                if (lockedReplay) {
                    return {
                        result: replayResolution(lockedReplay, orderId, cancellationId, requestHash),
                        events: [],
                    };
                }
                await tx.$queryRaw `SELECT id FROM "OrderCancellation" WHERE id = ${cancellationId} FOR UPDATE`;
                const cancellation = await tx.orderCancellation.findFirst({
                    where: { id: cancellationId, orderId },
                    select: {
                        ...RESOLUTION_SELECT,
                        resolutionIdempotencyKey: true,
                        resolutionRequestHash: true,
                        requestedBy: true,
                    },
                });
                if (!cancellation) {
                    throw new errors_1.ValidationError('order_cancellation_not_found', 'Заявка отмены не найдена');
                }
                if (cancellation.refundId || cancellation.status === 'refunded') {
                    throw new errors_1.ConflictError('cancellation_refund_already_created', 'По заявке уже создан или исполнен возврат');
                }
                if (cancellation.resolutionIdempotencyKey) {
                    throw new errors_1.ConflictError('cancellation_already_resolved', 'Заявка уже решена другим запросом');
                }
                if (cancellation.policySnapshot !== 'owner_resolution'
                    || !cancellation.purchaseOrderSentSnapshot
                    || cancellation.status !== 'awaiting_owner') {
                    throw new errors_1.ConflictError('cancellation_not_awaiting_owner', 'Заявка не ожидает решения владельца');
                }
                const receivedSupply = await tx.orderLineSupply.findFirst({
                    where: {
                        orderItem: { orderId, supplyModeSnapshot: 'to_order' },
                        status: { in: ['received', 'quality_check', 'ready', 'quarantined'] },
                    },
                    select: { id: true },
                });
                if (receivedSupply) {
                    throw new errors_1.ConflictError('cancellation_received_supply_requires_quarantine', 'Поступивший товар сначала должен пройти безопасный quarantine-процесс');
                }
                validateResolution(normalized, cancellation.depositPaidSnapshot);
                await this.assertEvidenceOnTx(tx, orderId, normalized.evidenceIds);
                await this.staffAuth.verifyStepUpOnTx(tx, actor, totpToken);
                if (normalized.action === 'reject') {
                    const rejected = await tx.orderCancellation.update({
                        where: { id: cancellationId },
                        data: {
                            status: 'rejected',
                            resolutionAction: normalized.action,
                            resolutionIdempotencyKey: idempotencyKey,
                            resolutionRequestHash: requestHash,
                            ownerReason: normalized.ownerReason,
                            evidence: normalized.evidenceIds,
                            resolvedBy: actor,
                            resolvedAt: new Date(),
                            completedAt: new Date(),
                        },
                        select: RESOLUTION_SELECT,
                    });
                    return {
                        result: rejected,
                        events: [{
                                type: event_types_1.EventType.OrderCancellationOwnerRejected,
                                actor,
                                payload: {
                                    cancellationId,
                                    orderId,
                                    reason: normalized.ownerReason,
                                    evidenceIds: normalized.evidenceIds,
                                },
                                refs: [cancellationId, orderId, ...normalized.evidenceIds],
                            }],
                    };
                }
                const refundAmount = normalized.action === 'approve_full'
                    ? cancellation.depositPaidSnapshot
                    : normalized.refundAmount;
                const refundAllocations = refundAmount > 0
                    ? await this.refundAllocationsOnTx(tx, orderId, refundAmount)
                    : [];
                await tx.orderLineSupply.updateMany({
                    where: { orderItem: { orderId, supplyModeSnapshot: 'to_order' } },
                    data: { status: 'customer_cancelled', actor },
                });
                await tx.orderItem.updateMany({
                    where: { orderId, supplyModeSnapshot: 'to_order' },
                    data: { fulfillmentStatus: 'customer_cancelled' },
                });
                await tx.orderReceivable.updateMany({
                    where: {
                        orderId,
                        status: { in: ['open', 'partially_settled', 'settled'] },
                    },
                    data: { status: 'cancelled' },
                });
                await tx.order.update({
                    where: { id: orderId },
                    data: { status: 'cancelled' },
                });
                let refundId = null;
                if (refundAmount > 0) {
                    const refund = await tx.refund.create({
                        data: {
                            purpose: 'customer_prepayment',
                            orderId,
                            idempotencyKey: `cancellation-resolution-refund:${cancellationId}`,
                            requestHash,
                            amount: refundAmount,
                            status: 'approved',
                            reason: normalized.ownerReason,
                            requester: cancellation.requestedBy,
                            approver: actor,
                            approvedAt: new Date(),
                            allocations: {
                                create: refundAllocations.map((allocation, ordinal) => ({
                                    ...allocation,
                                    ordinal,
                                })),
                            },
                        },
                    });
                    refundId = refund.id;
                }
                const now = new Date();
                const resolved = await tx.orderCancellation.update({
                    where: { id: cancellationId },
                    data: {
                        status: refundId ? 'refund_queued' : 'cancelled',
                        resolutionAction: normalized.action,
                        resolutionIdempotencyKey: idempotencyKey,
                        resolutionRequestHash: requestHash,
                        approvedRefundAmount: refundAmount,
                        supplierExpenseAmount: normalized.supplierExpenseAmount,
                        faultParty: normalized.faultParty,
                        ownerReason: normalized.ownerReason,
                        evidence: normalized.evidenceIds,
                        resolvedBy: actor,
                        resolvedAt: now,
                        completedAt: refundId ? null : now,
                        refundId,
                    },
                    select: RESOLUTION_SELECT,
                });
                const events = [{
                        type: event_types_1.EventType.OrderCancellationOwnerResolved,
                        actor,
                        payload: {
                            cancellationId,
                            orderId,
                            action: normalized.action,
                            faultParty: normalized.faultParty,
                            depositPaidSnapshot: cancellation.depositPaidSnapshot,
                            supplierExpenseAmount: normalized.supplierExpenseAmount,
                            approvedRefundAmount: refundAmount,
                            evidenceIds: normalized.evidenceIds,
                        },
                        refs: [cancellationId, orderId, ...normalized.evidenceIds],
                    }];
                if (refundId) {
                    events.push({
                        type: event_types_1.EventType.OrderCancellationRefundQueued,
                        actor,
                        payload: { cancellationId, orderId, refundId, amount: refundAmount },
                        refs: [cancellationId, orderId, refundId],
                    });
                    if (this.outbox) {
                        await (0, customer_notifications_1.enqueueSupplyCustomerNotice)(tx, this.outbox, {
                            customerId: cancellation.requestedBy,
                            template: 'supply_refund_queued',
                            eventKey: refundId,
                            payload: { orderId, refundId, amount: refundAmount },
                        });
                    }
                }
                else {
                    events.push({
                        type: event_types_1.EventType.OrderCancellationCompleted,
                        actor,
                        payload: { cancellationId, orderId, refundAmount: 0 },
                        refs: [cancellationId, orderId],
                    });
                }
                return { result: resolved, events };
            });
        }
        catch (error) {
            if (!(0, prisma_errors_1.isUniqueConstraintViolation)(error))
                throw error;
            const racedReplay = await this.prisma.orderCancellation.findUnique({
                where: { resolutionIdempotencyKey: idempotencyKey },
                select: {
                    ...RESOLUTION_SELECT,
                    resolutionIdempotencyKey: true,
                    resolutionRequestHash: true,
                },
            });
            if (racedReplay) {
                return replayResolution(racedReplay, orderId, cancellationId, requestHash);
            }
            throw new errors_1.ConflictError('cancellation_already_resolved', 'Заявка уже решена другим запросом');
        }
    }
    enabled() {
        return this.config.get('SUPPLY_CANCELLATION_ENABLED')?.trim().toLowerCase() === 'true'
            && this.config.get('SUPPLY_OWNER_RESOLUTION_ENABLED')?.trim().toLowerCase() === 'true';
    }
    assertOwnerRole(role) {
        if (role !== 'owner' && role !== 'admin') {
            throw new errors_1.ForbiddenError('cancellation_owner_role_required', 'Решение отмены после отправки PO доступно только owner/admin');
        }
    }
    async assertEvidenceOnTx(tx, orderId, evidenceIds) {
        if (evidenceIds.length === 0)
            return;
        const evidence = await tx.evidenceUpload.findMany({
            where: {
                id: { in: evidenceIds },
                entityType: 'order',
                entityId: orderId,
                purgedAt: null,
            },
            select: { id: true },
        });
        if (evidence.length !== evidenceIds.length) {
            throw new errors_1.ValidationError('cancellation_evidence_invalid', 'Evidence отсутствует, удалён или не принадлежит этому заказу');
        }
    }
    async refundAllocationsOnTx(tx, orderId, refundAmount) {
        const sources = await tx.paymentReceivableAllocation.findMany({
            where: {
                receivable: { orderId, kind: 'supply_deposit' },
                payment: {
                    amount: { gt: 0 },
                    status: { in: ['received', 'reconciled'] },
                },
            },
            include: { payment: true },
            orderBy: [{ payment: { createdAt: 'asc' } }, { paymentId: 'asc' }],
        });
        const grouped = new Map();
        for (const source of sources) {
            const current = grouped.get(source.paymentId);
            if (current)
                current.amount += source.amount;
            else
                grouped.set(source.paymentId, { payment: source.payment, amount: source.amount });
        }
        const allocations = [];
        let remaining = refundAmount;
        for (const entry of grouped.values()) {
            if (remaining === 0)
                break;
            await tx.$queryRaw `SELECT id FROM "Payment" WHERE id = ${entry.payment.id} FOR UPDATE`;
            const existing = await tx.refundAllocation.aggregate({
                where: {
                    originalPaymentId: entry.payment.id,
                    status: { not: 'failed' },
                },
                _sum: { amount: true },
            });
            const capacity = Math.max(0, entry.payment.amount - (existing._sum.amount ?? 0));
            const amount = Math.min(entry.amount, capacity, remaining);
            if (amount === 0)
                continue;
            allocations.push({
                originalPaymentId: entry.payment.id,
                amount,
                methodSnapshot: entry.payment.method,
                shiftId: entry.payment.shiftId,
            });
            remaining -= amount;
        }
        if (remaining !== 0) {
            throw new errors_1.ConflictError('cancellation_refund_allocation_mismatch', 'Сумма возврата не сходится с доступными исходными платежами задатка');
        }
        return allocations;
    }
};
exports.OrderCancellationResolutionService = OrderCancellationResolutionService;
exports.OrderCancellationResolutionService = OrderCancellationResolutionService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        staff_auth_service_1.StaffAuthService,
        config_1.ConfigService,
        outbox_service_1.OutboxService])
], OrderCancellationResolutionService);
function normalizeResolution(input) {
    return {
        action: input.action,
        refundAmount: input.refundAmount ?? null,
        supplierExpenseAmount: input.supplierExpenseAmount ?? 0,
        faultParty: input.faultParty ?? null,
        ownerReason: input.ownerReason.trim(),
        evidenceIds: [...new Set((input.evidenceIds ?? []).map((id) => id.trim()).filter(Boolean))].sort(),
    };
}
function validateResolution(input, depositPaid) {
    if (depositPaid < 0) {
        throw new errors_1.ConflictError('cancellation_snapshot_invalid', 'Снимок задатка повреждён');
    }
    if (input.ownerReason.length < 3 || input.ownerReason.length > 500) {
        throw new errors_1.ValidationError('owner_reason_invalid', 'Причина владельца должна содержать 3–500 символов');
    }
    if (input.action === 'reject') {
        if (input.refundAmount !== null || input.supplierExpenseAmount !== 0 || input.faultParty !== null) {
            throw new errors_1.ValidationError('cancellation_reject_payload_invalid', 'Для отклонения нельзя указывать возврат, расходы или виновную сторону');
        }
        return;
    }
    if (!input.faultParty) {
        throw new errors_1.ValidationError('cancellation_fault_party_required', 'Укажите виновную сторону');
    }
    if (input.supplierExpenseAmount < 0 || input.supplierExpenseAmount > depositPaid) {
        throw new errors_1.ValidationError('supplier_expense_invalid', 'Расходы поставщика должны быть от 0 до суммы задатка');
    }
    if (input.action === 'approve_full') {
        if ((input.refundAmount !== null && input.refundAmount !== depositPaid)
            || input.supplierExpenseAmount !== 0) {
            throw new errors_1.ValidationError('full_refund_amount_required', 'Полный возврат должен быть равен зафиксированному задатку без удержаний');
        }
        return;
    }
    if (input.faultParty !== 'customer') {
        throw new errors_1.ValidationError('full_refund_fault_required', 'При вине поставщика, AliStore или неустановленной вине разрешён только полный возврат');
    }
    if (input.evidenceIds.length === 0) {
        throw new errors_1.ValidationError('partial_refund_evidence_required', 'Частичное удержание требует Evidence');
    }
    if (input.refundAmount === null
        || input.refundAmount <= 0
        || input.refundAmount >= depositPaid
        || input.refundAmount !== depositPaid - input.supplierExpenseAmount
        || input.supplierExpenseAmount <= 0) {
        throw new errors_1.ValidationError('partial_refund_amount_invalid', 'Частичный возврат должен быть больше нуля и равен задатку минус подтверждённые расходы');
    }
}
function hashResolution(value) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex');
}
function replayResolution(cancellation, orderId, cancellationId, requestHash) {
    if (cancellation.orderId !== orderId
        || cancellation.id !== cancellationId
        || cancellation.resolutionRequestHash !== requestHash) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован с другим решением');
    }
    if (cancellation.status === 'refunded') {
        throw new errors_1.ConflictError('cancellation_already_completed', 'Исполненное решение отмены нельзя повторить или изменить');
    }
    const { resolutionIdempotencyKey: _resolutionIdempotencyKey, resolutionRequestHash: _resolutionRequestHash, ...publicCancellation } = cancellation;
    return publicCancellation;
}
//# sourceMappingURL=order-cancellation-resolution.service.js.map