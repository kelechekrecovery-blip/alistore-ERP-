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
var TelegramAgentRetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramAgentRetentionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const RETENTION_SWEEP_MS = 60 * 60_000;
const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RETENTION_BATCH_SIZE = 500;
const RETENTION_MAX_BATCHES = 100;
let TelegramAgentRetentionService = TelegramAgentRetentionService_1 = class TelegramAgentRetentionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TelegramAgentRetentionService_1.name);
    }
    onModuleInit() {
        void this.sweep();
        this.timer = setInterval(() => void this.sweep(), RETENTION_SWEEP_MS);
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async purgeExpired(now = new Date()) {
        const outboxCutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);
        let purged = 0;
        let redactedOutbox = 0;
        for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
            const expired = await this.prisma.telegramAgentMessage.findMany({
                where: { expiresAt: { lte: now } },
                orderBy: { expiresAt: 'asc' },
                take: RETENTION_BATCH_SIZE,
                select: { id: true },
            });
            if (expired.length > 0) {
                const deleted = await this.prisma.telegramAgentMessage.deleteMany({
                    where: { id: { in: expired.map((message) => message.id) } },
                });
                purged += deleted.count;
            }
            const outbox = await this.prisma.outboxMessage.findMany({
                where: {
                    channel: 'telegram',
                    template: { startsWith: 'telegram_agent_' },
                    createdAt: { lte: outboxCutoff },
                    NOT: [
                        { recipient: { startsWith: 'redacted:' } },
                        { recipient: { startsWith: 'revoked:' } },
                    ],
                },
                orderBy: { createdAt: 'asc' },
                take: RETENTION_BATCH_SIZE,
                select: { id: true, status: true },
            });
            const pendingIds = outbox
                .filter((message) => ['pending', 'failed'].includes(message.status))
                .map((message) => message.id);
            const completedIds = outbox
                .filter((message) => ['sent', 'cancelled'].includes(message.status))
                .map((message) => message.id);
            if (pendingIds.length > 0) {
                const cancelled = await this.prisma.outboxMessage.updateMany({
                    where: { id: { in: pendingIds }, status: { in: ['pending', 'failed'] } },
                    data: {
                        status: 'cancelled',
                        recipient: 'redacted:retention',
                        payload: { redacted: true, reason: 'telegram_retention_expired' },
                        nextAttemptAt: null,
                        lastError: 'telegram_retention_expired',
                    },
                });
                redactedOutbox += cancelled.count;
            }
            if (completedIds.length > 0) {
                const redacted = await this.prisma.outboxMessage.updateMany({
                    where: { id: { in: completedIds }, status: { in: ['sent', 'cancelled'] } },
                    data: {
                        recipient: 'redacted:retention',
                        payload: { redacted: true, reason: 'telegram_retention_expired' },
                    },
                });
                redactedOutbox += redacted.count;
            }
            if (expired.length < RETENTION_BATCH_SIZE && outbox.length < RETENTION_BATCH_SIZE)
                break;
        }
        return { purged, redactedOutbox };
    }
    async sweep() {
        try {
            const { purged, redactedOutbox } = await this.purgeExpired();
            if (purged > 0 || redactedOutbox > 0) {
                this.logger.log(`Telegram retention: deleted messages=${purged}, redacted outbox=${redactedOutbox}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown Telegram retention error';
            this.logger.warn(`Telegram agent retention sweep failed: ${message}`);
        }
    }
};
exports.TelegramAgentRetentionService = TelegramAgentRetentionService;
exports.TelegramAgentRetentionService = TelegramAgentRetentionService = TelegramAgentRetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TelegramAgentRetentionService);
//# sourceMappingURL=telegram-agent-retention.service.js.map