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
var OwnerAlertsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerAlertsService = exports.OWNER_ALERT_TEMPLATE = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const event_types_1 = require("../audit/event-types");
exports.OWNER_ALERT_TEMPLATE = 'owner_alert';
let OwnerAlertsService = OwnerAlertsService_1 = class OwnerAlertsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(OwnerAlertsService_1.name);
    }
    async sweep(windowHours = 24) {
        const since = new Date(Date.now() - windowHours * 3_600_000);
        const events = await this.prisma.auditEvent.findMany({
            where: {
                ts: { gte: since },
                type: { in: [event_types_1.EventType.ShiftClosed, event_types_1.EventType.ApprovalRequested] },
            },
            orderBy: { ts: 'asc' },
        });
        const candidates = events
            .map((event) => this.toAlert(event.id, event.type, event.payload))
            .filter((alert) => alert !== null);
        if (candidates.length === 0)
            return { alerted: 0, skipped: 0 };
        const sent = await this.prisma.outboxMessage.findMany({
            where: { template: exports.OWNER_ALERT_TEMPLATE, createdAt: { gte: since } },
            select: { payload: true },
        });
        const seen = new Set(sent
            .map((row) => row.payload?.eventId)
            .filter((id) => Boolean(id)));
        const fresh = candidates.filter((alert) => !seen.has(alert.eventId));
        const skipped = candidates.length - fresh.length;
        if (fresh.length === 0)
            return { alerted: 0, skipped };
        const owners = await this.prisma.staffUser.findMany({
            where: { role: 'owner', active: true },
            select: { id: true },
        });
        if (owners.length === 0) {
            this.logger.warn(`No active owner accounts — ${fresh.length} alert(s) dropped`);
            return { alerted: 0, skipped: candidates.length };
        }
        await this.prisma.outboxMessage.createMany({
            data: fresh.flatMap((alert) => owners.map((owner) => ({
                channel: 'push',
                recipient: owner.id,
                template: exports.OWNER_ALERT_TEMPLATE,
                payload: alert,
            }))),
        });
        this.logger.log(`Owner alerts: ${fresh.length} event(s) → ${owners.length} owner(s)`);
        return { alerted: fresh.length, skipped };
    }
    toAlert(eventId, type, raw) {
        const payload = (raw ?? {});
        if (type === event_types_1.EventType.ShiftClosed) {
            const diff = Number(payload['diff'] ?? 0);
            if (!Number.isFinite(diff) || diff === 0)
                return null;
            return {
                eventId,
                kind: 'cash_variance',
                diff,
                shiftId: String(payload['shiftId'] ?? ''),
                expected: Number(payload['expected'] ?? 0),
                closeCash: Number(payload['closeCash'] ?? 0),
            };
        }
        if (type === event_types_1.EventType.ApprovalRequested) {
            return {
                eventId,
                kind: 'approval_requested',
                action: String(payload['action'] ?? ''),
                approvalId: String(payload['approvalId'] ?? ''),
            };
        }
        return null;
    }
};
exports.OwnerAlertsService = OwnerAlertsService;
exports.OwnerAlertsService = OwnerAlertsService = OwnerAlertsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OwnerAlertsService);
//# sourceMappingURL=owner-alerts.service.js.map