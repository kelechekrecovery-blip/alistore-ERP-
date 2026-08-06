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
exports.SupportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const customer_notifications_1 = require("../outbox/customer-notifications");
const ticket_state_1 = require("./ticket-state");
let SupportService = class SupportService {
    constructor(prisma, audit, outbox) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
    }
    get(id) {
        return this.prisma.supportTicket.findUnique({ where: { id } });
    }
    list(filter) {
        return this.prisma.supportTicket.findMany({
            where: {
                ...(filter.customerId ? { customerId: filter.customerId } : {}),
                ...(filter.status ? { status: filter.status } : {}),
            },
            orderBy: { sla: 'asc' },
            take: 100,
        });
    }
    async open(dto, actor, idempotencyKey) {
        const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${dto.customerId} не найден`);
        }
        const priority = (0, ticket_state_1.normalizePriority)(dto.priority);
        const key = idempotencyKey?.trim() || undefined;
        if (key) {
            const existing = await this.prisma.supportTicket.findUnique({ where: { idempotencyKey: key } });
            if (existing)
                return replayTicket(existing, dto, priority);
        }
        const sla = (0, ticket_state_1.slaFor)(priority, Date.now());
        return this.audit.transaction(async (tx) => {
            if (key) {
                await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'support:' + key}))::text AS locked`;
                const replay = await tx.supportTicket.findUnique({ where: { idempotencyKey: key } });
                if (replay)
                    return { result: replayTicket(replay, dto, priority), events: [] };
            }
            const ticket = await tx.supportTicket.create({
                data: {
                    customerId: dto.customerId,
                    channel: dto.channel,
                    subject: dto.subject,
                    body: dto.body ?? null,
                    priority,
                    sla,
                    status: 'new',
                    idempotencyKey: key,
                },
            });
            return {
                result: ticket,
                events: [
                    {
                        type: event_types_1.EventType.TicketCreated,
                        actor,
                        payload: { ticketId: ticket.id, channel: dto.channel, priority, sla: sla.toISOString() },
                        refs: [ticket.id, dto.customerId],
                    },
                ],
            };
        });
    }
    async transition(id, to, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const [ticket] = await tx.$queryRaw `
        SELECT * FROM "SupportTicket" WHERE id = ${id} FOR UPDATE
      `;
            if (!ticket) {
                throw new errors_1.ValidationError('ticket_not_found', `Тикет ${id} не найден`);
            }
            (0, ticket_state_1.assertTicketTransition)(ticket.status, to);
            const claimed = await tx.supportTicket.updateMany({
                where: {
                    id,
                    revision: ticket.revision,
                    status: ticket.status,
                    assignee: ticket.assignee,
                    priority: ticket.priority,
                    sla: ticket.sla,
                },
                data: { status: to, ...(dto.assignee ? { assignee: dto.assignee } : {}) },
            });
            if (claimed.count !== 1) {
                throw new errors_1.ConflictError('support_ticket_stale', `Тикет ${id} изменён конкурентной операцией`);
            }
            const updated = await tx.supportTicket.findUniqueOrThrow({ where: { id } });
            if (this.outbox && to === 'resolved') {
                await (0, customer_notifications_1.enqueueConsentedCustomerNotice)(tx, this.outbox, {
                    customerId: ticket.customerId,
                    template: 'ticket_resolved',
                    payload: { ticketId: id, subject: ticket.subject },
                    transactional: true,
                });
            }
            return {
                result: updated,
                events: [
                    {
                        type: `ticket.${to}`,
                        actor,
                        payload: { ticketId: id, from: ticket.status, to, assignee: updated.assignee },
                        refs: [id, ticket.customerId],
                    },
                ],
            };
        });
    }
    async escalate(id, actor) {
        return this.audit.transaction(async (tx) => {
            const [ticket] = await tx.$queryRaw `
        SELECT * FROM "SupportTicket" WHERE id = ${id} FOR UPDATE
      `;
            if (!ticket) {
                throw new errors_1.ValidationError('ticket_not_found', `Тикет ${id} не найден`);
            }
            if (ticket.status === 'closed' || ticket.status === 'resolved') {
                throw new errors_1.ConflictError('ticket_not_escalatable', `Тикет ${id} уже ${ticket.status}`);
            }
            const next = (0, ticket_state_1.escalatedPriority)(ticket.priority);
            if (!next) {
                throw new errors_1.ConflictError('ticket_max_priority', `Тикет ${id} уже на максимальном приоритете`);
            }
            const sla = (0, ticket_state_1.slaFor)(next, Date.now());
            const claimed = await tx.supportTicket.updateMany({
                where: {
                    id,
                    revision: ticket.revision,
                    status: ticket.status,
                    assignee: ticket.assignee,
                    priority: ticket.priority,
                    sla: ticket.sla,
                },
                data: { priority: next, sla },
            });
            if (claimed.count !== 1) {
                throw new errors_1.ConflictError('support_ticket_stale', `Тикет ${id} изменён конкурентной операцией`);
            }
            const updated = await tx.supportTicket.findUniqueOrThrow({ where: { id } });
            return {
                result: updated,
                events: [
                    {
                        type: event_types_1.EventType.TicketEscalated,
                        actor,
                        payload: { ticketId: id, from: ticket.priority, to: next, sla: sla.toISOString() },
                        refs: [id, ticket.customerId],
                    },
                ],
            };
        });
    }
};
exports.SupportService = SupportService;
exports.SupportService = SupportService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService])
], SupportService);
function replayTicket(ticket, dto, priority) {
    const same = ticket.customerId === dto.customerId && ticket.channel === dto.channel &&
        ticket.subject === dto.subject && ticket.body === (dto.body ?? null) && ticket.priority === priority;
    if (!same)
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим обращением');
    return ticket;
}
//# sourceMappingURL=support.service.js.map