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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceSlaService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const prisma_service_1 = require("../prisma/prisma.service");
const TERMINAL_STATUSES = ['repaired', 'replaced', 'rejected', 'closed'];
let ServiceSlaService = class ServiceSlaService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async escalateOverdue(now = new Date()) {
        const candidates = await this.prisma.warrantyCase.findMany({
            where: {
                sla: { lt: now },
                slaEscalatedAt: null,
                status: { notIn: [...TERMINAL_STATUSES] },
            },
            select: { id: true },
            take: 100,
        });
        let escalated = 0;
        for (const candidate of candidates) {
            const applied = await this.audit.transaction(async (tx) => {
                const updated = await tx.warrantyCase.updateMany({
                    where: {
                        id: candidate.id,
                        sla: { lt: now },
                        slaEscalatedAt: null,
                        status: { notIn: [...TERMINAL_STATUSES] },
                    },
                    data: { slaEscalatedAt: now },
                });
                if (updated.count !== 1)
                    return { result: false, events: [] };
                const current = await tx.warrantyCase.findUniqueOrThrow({
                    where: { id: candidate.id },
                    include: { workOrder: { select: { point: true } } },
                });
                const recipients = current.workOrder
                    ? await tx.staffUser.findMany({
                        where: { active: true, point: current.workOrder.point, role: { in: ['service', 'admin', 'owner'] } },
                        select: { id: true },
                    })
                    : [];
                await tx.outboxMessage.createMany({
                    data: [current.customerId, ...recipients.map((recipient) => recipient.id)].map((recipient) => ({
                        channel: 'push',
                        recipient,
                        template: 'service_sla_breached',
                        payload: { warrantyCaseId: current.id, status: current.status, sla: current.sla.toISOString() },
                    })),
                });
                return {
                    result: true,
                    events: [{
                            type: event_types_1.EventType.ServiceSlaBreached,
                            actor: 'system',
                            payload: { warrantyCaseId: current.id, status: current.status, sla: current.sla.toISOString() },
                            refs: [current.id, current.imei, current.customerId],
                        }],
                };
            });
            if (applied)
                escalated += 1;
        }
        return { escalated };
    }
    async escalateOverdueLoaners(now = new Date()) {
        const candidates = await this.prisma.loanerLoan.findMany({
            where: { status: 'issued', dueAt: { lt: now }, overdueEscalatedAt: null },
            select: { id: true },
            take: 100,
        });
        let escalated = 0;
        for (const candidate of candidates) {
            const applied = await this.audit.transaction(async (tx) => {
                const updated = await tx.loanerLoan.updateMany({
                    where: { id: candidate.id, status: 'issued', dueAt: { lt: now }, overdueEscalatedAt: null },
                    data: { status: 'overdue', overdueEscalatedAt: now },
                });
                if (updated.count !== 1)
                    return { result: false, events: [] };
                const loan = await tx.loanerLoan.findUniqueOrThrow({
                    where: { id: candidate.id },
                    include: { device: { include: { unit: true } }, workOrder: { select: { point: true, warrantyCaseId: true } } },
                });
                const recipients = await tx.staffUser.findMany({
                    where: { active: true, point: loan.workOrder.point, role: { in: ['service', 'admin', 'owner'] } },
                    select: { id: true },
                });
                await tx.outboxMessage.createMany({
                    data: [loan.customerId, ...recipients.map((recipient) => recipient.id)].map((recipient) => ({
                        channel: 'push', recipient, template: 'service_loaner_overdue',
                        payload: { loanId: loan.id, workOrderId: loan.workOrderId, dueAt: loan.dueAt.toISOString() },
                    })),
                });
                return {
                    result: true,
                    events: [{ type: event_types_1.EventType.ServiceLoanerOverdue, actor: 'system', payload: { loanId: loan.id, workOrderId: loan.workOrderId, dueAt: loan.dueAt.toISOString() }, refs: [loan.id, loan.workOrderId, loan.workOrder.warrantyCaseId, loan.customerId, loan.device.unit.imei] }],
                };
            });
            if (applied)
                escalated += 1;
        }
        return { escalated };
    }
};
exports.ServiceSlaService = ServiceSlaService;
exports.ServiceSlaService = ServiceSlaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], ServiceSlaService);
//# sourceMappingURL=service-sla.service.js.map