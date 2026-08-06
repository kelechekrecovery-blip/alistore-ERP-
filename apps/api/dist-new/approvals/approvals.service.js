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
exports.ApprovalsService = exports.SINGLE_APPROVER_ACTIONS = exports.FOUR_EYES_ACTIONS = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const permissions_1 = require("../rbac/permissions");
const action_executors_1 = require("./action-executors");
const exchanges_service_1 = require("../exchanges/exchanges.service");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
exports.FOUR_EYES_ACTIONS = [
    'campaign_budget',
    'storefront_publish',
    'ai_support_triage',
    'procurement_draft',
    'refund',
    'quarantine_write_off',
    'exchange',
    'manual_adjustment',
    'discount',
    'price',
    'debt',
    'delete',
    'write_off',
    'stock_adjust',
    'pii',
];
exports.SINGLE_APPROVER_ACTIONS = [];
function canonicalJson(value) {
    const normalize = (candidate) => {
        if (Array.isArray(candidate)) {
            return candidate.map((item) => item === undefined ? null : normalize(item));
        }
        if (candidate && typeof candidate === 'object') {
            return Object.fromEntries(Object.entries(candidate)
                .filter(([, item]) => item !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, normalize(item)]));
        }
        return candidate ?? null;
    };
    return JSON.stringify(normalize(value));
}
let ApprovalsService = class ApprovalsService {
    constructor(prisma, audit, exchanges, staffAuth, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.exchanges = exchanges;
        this.staffAuth = staffAuth;
        this.outbox = outbox;
    }
    get(id) {
        return this.prisma.approval.findUnique({ where: { id }, include: { exchangeRequest: true } });
    }
    list(status) {
        return this.prisma.approval.findMany({
            where: status ? { status: status } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { exchangeRequest: true },
        });
    }
    async request(req) {
        return this.audit.transaction((tx) => this.requestOnTx(tx, req));
    }
    async requestOnTx(tx, req) {
        const key = req.idempotencyKey?.trim() || undefined;
        if (key) {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'approval-request:' + key}))::text AS locked`;
            const replay = await this.replayApprovalOnTx(tx, key, req);
            if (replay)
                return replay;
        }
        return this.createApprovalOnTx(tx, req, key);
    }
    async replayApprovalOnTx(tx, key, req) {
        const existing = await tx.approval.findUnique({ where: { idempotencyKey: key } });
        if (!existing)
            return null;
        const stored = existing.evidence;
        const sameCommand = existing.action === req.action
            && existing.requester === req.requester
            && existing.reason === req.reason
            && canonicalJson(stored?.payload ?? null) === canonicalJson(req.payload ?? null)
            && canonicalJson(stored?.evidence ?? null) === canonicalJson(req.evidence ?? null);
        if (!sameCommand) {
            throw new errors_1.ConflictError('idempotency_key_reused', 'Этот Idempotency-Key уже занят другим инициатором или командой');
        }
        if (existing.status !== 'requested') {
            throw new errors_1.ConflictError('approval_already_decided', `Эта заявка уже ${existing.status === 'approved' ? 'одобрена' : 'обработана'}. Повторите с новым ключом, если это новая операция.`);
        }
        return {
            result: { approvalId: existing.id, status: 'requested' },
            events: [],
        };
    }
    async createApprovalOnTx(tx, req, key) {
        const approval = await tx.approval.create({
            data: {
                action: req.action,
                requester: req.requester,
                reason: req.reason,
                status: 'requested',
                idempotencyKey: key,
                sourceRef: req.sourceRef,
                evidence: {
                    payload: req.payload ?? null,
                    evidence: req.evidence ?? null,
                },
            },
        });
        if (this.outbox) {
            await (0, customer_notifications_1.enqueueStaffNotice)(tx, this.outbox, {
                template: 'approval_requested',
                title: 'Нужно согласование',
                body: `${req.action} · ${req.reason}`,
                payload: { approvalId: approval.id, action: req.action, deepLink: `alistore-admin://approvals/${approval.id}` },
            });
        }
        return {
            result: { approvalId: approval.id, status: 'requested' },
            events: [
                {
                    type: event_types_1.EventType.ApprovalRequested,
                    actor: req.requester,
                    payload: { approvalId: approval.id, action: req.action, reason: req.reason },
                    refs: [approval.id],
                },
            ],
        };
    }
    async decide(id, input) {
        return this.audit.transaction((tx) => this.decideOnTx(tx, id, input));
    }
    async decideWithStepUp(id, input, totpToken) {
        return this.audit.transaction(async (tx) => {
            if (!this.staffAuth)
                throw new errors_1.ConflictError('staff_auth_missing', 'Step-up executor не подключён');
            await tx.$queryRaw `SELECT id FROM "Approval" WHERE id = ${id} FOR UPDATE`;
            await this.staffAuth.verifyStepUpOnTx(tx, input.approver, totpToken);
            return this.decideOnTx(tx, id, input);
        });
    }
    async decideOnTx(tx, id, input) {
        await tx.$queryRaw `SELECT id FROM "Approval" WHERE id = ${id} FOR UPDATE`;
        const approval = await tx.approval.findUnique({ where: { id }, include: { exchangeRequest: true } });
        if (!approval) {
            throw new errors_1.ValidationError('approval_not_found', `Approval ${id} не найден`);
        }
        if (approval.status !== 'requested') {
            throw new errors_1.ConflictError('approval_already_decided', `Approval ${id} уже ${approval.status}`);
        }
        if (!(0, permissions_1.canApprove)(approval.action, input.approverRole)) {
            throw new errors_1.ForbiddenError('approver_not_authorized', `Роль ${input.approverRole} не может решать действие «${approval.action}»`);
        }
        if (exports.FOUR_EYES_ACTIONS.includes(approval.action)
            && approval.requester === input.approver) {
            throw new errors_1.ForbiddenError('four_eye_approval_required', 'Инициатор не может согласовать собственное материальное действие');
        }
        if (approval.action === 'exchange') {
            if (!this.exchanges)
                throw new errors_1.ConflictError('exchange_executor_missing', 'Exchange executor не подключён');
            if (!approval.exchangeRequest) {
                throw new errors_1.ConflictError('exchange_request_missing', 'Approval не связан с заявкой обмена');
            }
            const expiryEvents = [];
            const expired = await this.exchanges.expireIfPastDeadlineOnTx(tx, approval.exchangeRequest.id, id, new Date(), expiryEvents);
            if (expired) {
                return {
                    result: await tx.approval.findUnique({ where: { id } }),
                    events: expiryEvents,
                };
            }
        }
        const parkedPayload = approval.evidence
            ?.payload;
        if (input.status === 'approved' && approval.action === 'procurement_draft' && !parkedPayload) {
            throw new errors_1.ValidationError('procurement_draft_snapshot_missing', 'Закупочный draft не содержит сохранённого snapshot для исполнения');
        }
        if (input.status === 'approved'
            && approval.action === 'stock_adjust'
            && (!parkedPayload || !Object.prototype.hasOwnProperty.call(parkedPayload, 'expectedOnHand'))) {
            const rejected = await tx.approval.updateMany({
                where: { id, status: 'requested' },
                data: { status: 'rejected', approver: input.approver },
            });
            if (rejected.count === 0) {
                throw new errors_1.ConflictError('approval_already_decided', `Approval ${id} уже решён другим аппрувером`);
            }
            return {
                result: await tx.approval.findUnique({ where: { id } }),
                events: [
                    {
                        type: event_types_1.EventType.ApprovalRejected,
                        actor: input.approver,
                        payload: {
                            approvalId: id,
                            action: approval.action,
                            outcome: 'legacy_snapshot_required',
                            reason: 'Legacy stock adjustment must be re-requested with a balance snapshot',
                        },
                        refs: [id],
                    },
                ],
            };
        }
        const decidedStatus = input.status === 'rejected' ? 'rejected' : 'approved';
        const claim = await tx.approval.updateMany({
            where: { id, status: 'requested' },
            data: { status: decidedStatus, approver: input.approver },
        });
        if (claim.count === 0) {
            throw new errors_1.ConflictError('approval_already_decided', `Approval ${id} уже решён другим аппрувером`);
        }
        const updated = await tx.approval.findUnique({ where: { id } });
        if (input.status === 'rejected') {
            const events = [
                {
                    type: event_types_1.EventType.ApprovalRejected,
                    actor: input.approver,
                    payload: { approvalId: id, action: approval.action, reason: input.reason ?? null },
                    refs: [id],
                },
            ];
            const payload = approval.evidence
                ?.payload;
            const reject = action_executors_1.ACTION_REJECTION_EXECUTORS[approval.action];
            if (reject && payload) {
                await reject(tx, payload, input.approver, id, input.reason ?? null, events);
            }
            if (approval.action === 'exchange' && approval.exchangeRequest) {
                if (!this.exchanges)
                    throw new errors_1.ConflictError('exchange_executor_missing', 'Exchange executor не подключён');
                await this.exchanges.rejectApprovedOnTx(tx, approval.exchangeRequest.id, id, input.approver, input.reason ?? null, events);
            }
            return {
                result: updated,
                events,
            };
        }
        const events = [
            {
                type: event_types_1.EventType.ApprovalApproved,
                actor: input.approver,
                payload: { approvalId: id, action: approval.action },
                refs: [id],
            },
        ];
        const payload = approval.evidence
            ?.payload;
        const execute = action_executors_1.ACTION_EXECUTORS[approval.action];
        if (execute && payload) {
            await execute(tx, payload, input.approver, id, events);
        }
        if (approval.action === 'exchange') {
            if (!this.exchanges)
                throw new errors_1.ConflictError('exchange_executor_missing', 'Exchange executor не подключён');
            if (!approval.exchangeRequest) {
                throw new errors_1.ConflictError('exchange_request_missing', 'Approval не связан с заявкой обмена');
            }
            const exchange = await this.exchanges.executeApprovedOnTx(tx, approval.exchangeRequest.id, input.approver, id);
            events.push(...exchange.events);
        }
        if (this.outbox && approval.action === 'refund' && typeof payload?.refundId === 'string') {
            const approvedRefund = await tx.refund.findUnique({
                where: { id: payload.refundId },
                include: { order: { select: { customerId: true } } },
            });
            if (approvedRefund) {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: approvedRefund.order.customerId,
                    template: 'refund_approved',
                    payload: { refundId: approvedRefund.id, returnId: approvedRefund.returnId, orderId: approvedRefund.orderId, amount: approvedRefund.amount },
                    transactional: true,
                });
            }
        }
        return { result: updated, events };
    }
};
exports.ApprovalsService = ApprovalsService;
exports.ApprovalsService = ApprovalsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        exchanges_service_1.ExchangesService,
        staff_auth_service_1.StaffAuthService,
        outbox_service_1.OutboxService])
], ApprovalsService);
//# sourceMappingURL=approvals.service.js.map