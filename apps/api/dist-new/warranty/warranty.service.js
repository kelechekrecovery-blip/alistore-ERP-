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
exports.WarrantyService = exports.WARRANTY_SLA_DAYS = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const warranty_state_1 = require("./warranty-state");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const prisma_errors_1 = require("../common/prisma-errors");
exports.WARRANTY_SLA_DAYS = 14;
const CLOSED_STATUSES = ['repaired', 'replaced', 'closed', 'rejected'];
const ACTIVE_STATUSES = ['created', 'received', 'diagnostics', 'waiting_supplier', 'approved'];
let WarrantyService = class WarrantyService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    get(id) {
        return this.prisma.warrantyCase.findUnique({ where: { id } });
    }
    list(filter) {
        return this.prisma.warrantyCase.findMany({
            where: {
                ...(filter.customerId ? { customerId: filter.customerId } : {}),
                ...(filter.imei ? { imei: filter.imei } : {}),
                ...(filter.status ? { status: filter.status } : {}),
            },
            orderBy: { sla: 'asc' },
            take: 100,
        });
    }
    async open(input, actor, idempotencyKey) {
        const unit = await this.prisma.deviceUnit.findUnique({ where: { imei: input.imei } });
        if (!unit) {
            throw new errors_1.ValidationError('unit_not_found', `Устройство ${input.imei} не найдено`);
        }
        const order = unit.orderId
            ? await this.prisma.order.findUnique({ where: { id: unit.orderId }, select: { customerId: true } })
            : null;
        if (!order || order.customerId !== input.customerId) {
            throw new errors_1.ValidationError('device_not_owned', 'Устройство не принадлежит этому клиенту');
        }
        const key = idempotencyKey?.trim();
        if (key && key.length > 128) {
            throw new errors_1.ValidationError('invalid_idempotency_key', 'Idempotency key слишком длинный');
        }
        if (key) {
            const existing = await this.prisma.warrantyOpenCommand.findUnique({ where: { idempotencyKey: key } });
            if (existing)
                return this.replayOpen(existing, input);
        }
        const sla = new Date(Date.now() + exports.WARRANTY_SLA_DAYS * 24 * 60 * 60 * 1000);
        try {
            return await this.audit.transaction(async (tx) => {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${input.imei}))::text AS locked`;
                if (key) {
                    const replay = await tx.warrantyOpenCommand.findUnique({ where: { idempotencyKey: key } });
                    if (replay)
                        return { result: await this.replayOpen(replay, input), events: [] };
                }
                const active = await tx.warrantyCase.findFirst({
                    where: { imei: input.imei, customerId: input.customerId, status: { in: ACTIVE_STATUSES } },
                    orderBy: { sla: 'asc' },
                });
                if (active)
                    throw new errors_1.ConflictError('warranty_already_open', 'По устройству уже есть активное обращение');
                if (key) {
                    await tx.warrantyOpenCommand.create({
                        data: { idempotencyKey: key, customerId: input.customerId, imei: input.imei, problem: input.problem },
                    });
                }
                const wc = await tx.warrantyCase.create({
                    data: {
                        imei: input.imei,
                        customerId: input.customerId,
                        problem: input.problem,
                        status: 'created',
                        sla,
                    },
                });
                if (key) {
                    await tx.warrantyOpenCommand.update({ where: { idempotencyKey: key }, data: { warrantyCaseId: wc.id } });
                }
                if (this.outbox) {
                    await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                        customerId: wc.customerId,
                        template: 'warranty_created',
                        payload: { warrantyId: wc.id, imei: input.imei, sla: sla.toISOString() },
                    });
                }
                return {
                    result: wc,
                    events: [
                        {
                            type: event_types_1.EventType.WarrantyCreated,
                            actor,
                            payload: { warrantyId: wc.id, imei: input.imei, sla: sla.toISOString() },
                            refs: [wc.id, input.imei],
                        },
                    ],
                };
            });
        }
        catch (error) {
            if (key && isUniqueViolation(error)) {
                const raced = await this.prisma.warrantyOpenCommand.findUniqueOrThrow({ where: { idempotencyKey: key } });
                return this.replayOpen(raced, input);
            }
            throw error;
        }
    }
    async replayOpen(command, input) {
        const matches = command.customerId === input.customerId && command.imei === input.imei && command.problem === input.problem;
        if (!matches)
            throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим обращением');
        if (!command.warrantyCaseId)
            throw new errors_1.ConflictError('warranty_open_in_progress', 'Гарантийное обращение ещё создаётся');
        const warranty = await this.prisma.warrantyCase.findUnique({ where: { id: command.warrantyCaseId } });
        if (!warranty)
            throw new errors_1.ValidationError('warranty_not_found', 'Гарантийное обращение не найдено');
        return warranty;
    }
    async transition(id, to, actor) {
        return this.audit.transaction(async (tx) => {
            const wc = await tx.warrantyCase.findUnique({ where: { id }, include: { workOrder: { select: { id: true } } } });
            if (!wc) {
                throw new errors_1.ValidationError('warranty_not_found', `Гарантия ${id} не найдена`);
            }
            if (wc.workOrder) {
                throw new errors_1.ValidationError('service_work_order_managed', 'Кейс с заказ-нарядом изменяется только через Service Center');
            }
            (0, warranty_state_1.assertWarrantyTransition)(wc.status, to);
            const updated = await tx.warrantyCase.update({ where: { id }, data: { status: to } });
            const type = CLOSED_STATUSES.includes(to) ? event_types_1.EventType.WarrantyClosed : `warranty.${to}`;
            if (this.outbox && CLOSED_STATUSES.includes(to)) {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: wc.customerId,
                    template: 'warranty_closed',
                    payload: { warrantyId: id, imei: wc.imei, from: wc.status, to },
                });
            }
            return {
                result: updated,
                events: [
                    {
                        type,
                        actor,
                        payload: { warrantyId: id, from: wc.status, to },
                        refs: [id, wc.imei],
                    },
                ],
            };
        });
    }
};
exports.WarrantyService = WarrantyService;
exports.WarrantyService = WarrantyService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], WarrantyService);
function isUniqueViolation(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
//# sourceMappingURL=warranty.service.js.map