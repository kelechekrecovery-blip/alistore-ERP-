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
var OutboxService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const outbox_types_1 = require("./outbox.types");
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60 * 60 * 1_000;
const CLAIM_LEASE_MS = 5 * 60 * 1_000;
let OutboxService = OutboxService_1 = class OutboxService {
    constructor(prisma, transport, audit) {
        this.prisma = prisma;
        this.transport = transport;
        this.audit = audit;
        this.logger = new common_1.Logger(OutboxService_1.name);
    }
    async enqueueOnTx(tx, input) {
        if (input.dedupKey) {
            const data = this.toData(input);
            await tx.outboxMessage.upsert({
                where: { id: durableMessageId(input) },
                create: { id: durableMessageId(input), ...data },
                update: {},
            });
            return;
        }
        await tx.outboxMessage.create({ data: this.toData(input) });
    }
    async enqueue(input) {
        if (input.dedupKey) {
            const data = this.toData(input);
            await this.prisma.outboxMessage.upsert({
                where: { id: durableMessageId(input) },
                create: { id: durableMessageId(input), ...data },
                update: {},
            });
            return;
        }
        await this.prisma.outboxMessage.create({ data: this.toData(input) });
    }
    async relayPending(limit = 50) {
        const now = new Date();
        const pending = await this.prisma.outboxMessage.findMany({
            where: {
                attempts: { lt: MAX_ATTEMPTS },
                OR: [
                    { status: 'pending', nextAttemptAt: { lte: now } },
                    { status: 'processing', nextAttemptAt: { lte: now } },
                ],
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
        let sent = 0;
        let failed = 0;
        for (const message of pending) {
            const isTelegramAgentReply = message.channel === 'telegram' && message.template === 'telegram_agent_reply';
            const processingToken = isTelegramAgentReply ? null : (0, node_crypto_1.randomUUID)();
            const claimed = isTelegramAgentReply
                ? { count: 1 }
                : await this.prisma.outboxMessage.updateMany({
                    where: {
                        id: message.id,
                        attempts: { lt: MAX_ATTEMPTS },
                        OR: [
                            { status: 'pending', nextAttemptAt: { lte: now } },
                            { status: 'processing', nextAttemptAt: { lte: now } },
                        ],
                    },
                    data: {
                        status: 'processing',
                        processingToken,
                        nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS),
                    },
                });
            if (claimed.count !== 1)
                continue;
            const deliveryWhere = isTelegramAgentReply
                ? { id: message.id, status: 'pending' }
                : { id: message.id, status: 'processing', processingToken };
            try {
                if (message.channel === 'telegram' && message.template === 'telegram_agent_reply') {
                    const outcome = await this.deliverTelegramAgentReply(message);
                    if (outcome === 'sent')
                        sent += 1;
                    continue;
                }
                await this.transport.deliver({
                    channel: message.channel,
                    recipient: message.recipient,
                    template: message.template,
                    payload: message.payload,
                });
                await this.prisma.outboxMessage.update({
                    where: deliveryWhere,
                    data: { status: 'sent', processingToken: null, sentAt: new Date(), nextAttemptAt: null },
                });
                sent += 1;
            }
            catch (err) {
                const attempts = message.attempts + 1;
                const capped = attempts >= MAX_ATTEMPTS;
                const delayMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
                const data = {
                    attempts,
                    lastError: err instanceof Error ? err.message : 'unknown error',
                    status: capped ? 'failed' : 'pending',
                    processingToken: null,
                    nextAttemptAt: capped ? null : new Date(Date.now() + delayMs),
                };
                const updated = isTelegramAgentReply
                    ? await this.prisma.outboxMessage.updateMany({
                        where: deliveryWhere,
                        data,
                    })
                    : await this.prisma.outboxMessage.updateMany({
                        where: deliveryWhere,
                        data,
                    });
                if (capped && updated.count === 1)
                    failed += 1;
                this.logger.warn(`Outbox delivery failed (${message.channel} ${message.id}), attempt ${attempts}`);
            }
        }
        return { sent, failed };
    }
    async deliverTelegramAgentReply(message) {
        return this.prisma.$transaction(async (tx) => {
            const initial = await tx.telegramAgentIdentity.findFirst({
                where: { chatId: message.recipient },
                select: { id: true, staffId: true, customerId: true },
            });
            if (initial?.staffId) {
                await tx.$queryRaw `SELECT id FROM "StaffUser" WHERE id = ${initial.staffId} FOR UPDATE`;
            }
            else if (initial?.customerId) {
                await tx.$queryRaw `SELECT id FROM "Customer" WHERE id = ${initial.customerId} FOR UPDATE`;
            }
            if (initial) {
                await tx.$queryRaw `SELECT id FROM "TelegramAgentIdentity" WHERE id = ${initial.id} FOR UPDATE`;
            }
            await tx.$queryRaw `SELECT id FROM "OutboxMessage" WHERE id = ${message.id} FOR UPDATE`;
            const queued = await tx.outboxMessage.findUnique({
                where: { id: message.id },
                select: { status: true },
            });
            if (queued?.status !== 'pending')
                return 'skipped';
            const identity = initial
                ? await tx.telegramAgentIdentity.findUnique({
                    where: { id: initial.id },
                    include: {
                        staff: { select: { active: true, role: true } },
                        customer: { select: { phone: true } },
                    },
                })
                : null;
            const active = Boolean(identity?.active &&
                (identity.kind === 'staff'
                    ? identity.staff?.active && ['admin', 'owner'].includes(identity.staff.role)
                    : identity.customer && !identity.customer.phone.startsWith('deleted:')));
            if (!active) {
                await tx.outboxMessage.updateMany({
                    where: { id: message.id, status: 'pending' },
                    data: {
                        status: 'cancelled',
                        recipient: initial ? `revoked:${initial.id}` : 'revoked:unlinked',
                        payload: { redacted: true, reason: 'telegram_identity_inactive' },
                        nextAttemptAt: null,
                        lastError: 'telegram_identity_inactive',
                    },
                });
                return 'cancelled';
            }
            await this.transport.deliver({
                channel: message.channel,
                recipient: message.recipient,
                template: message.template,
                payload: message.payload,
            });
            const updated = await tx.outboxMessage.updateMany({
                where: { id: message.id, status: 'pending' },
                data: { status: 'sent', sentAt: new Date(), nextAttemptAt: null },
            });
            return updated.count === 1 ? 'sent' : 'skipped';
        }, {
            maxWait: 2_000,
            timeout: 8_000,
        });
    }
    async redrive(id, actor) {
        const audit = this.audit ?? new audit_service_1.AuditService(this.prisma);
        return audit.transaction(async (tx) => {
            const message = await tx.outboxMessage.findUnique({ where: { id } });
            if (!message) {
                throw new errors_1.ValidationError('outbox_message_not_found', 'Сообщение outbox не найдено');
            }
            const reset = await tx.outboxMessage.updateMany({
                where: { id, status: 'failed' },
                data: {
                    status: 'pending',
                    attempts: 0,
                    lastError: null,
                    sentAt: null,
                    nextAttemptAt: new Date(),
                },
            });
            if (reset.count === 0) {
                throw new errors_1.ConflictError('outbox_message_not_failed', 'Повторно в очередь можно вернуть только сообщение со статусом failed');
            }
            const result = await tx.outboxMessage.findUniqueOrThrow({ where: { id } });
            return {
                result,
                events: [
                    {
                        type: event_types_1.EventType.OutboxMessageRedriven,
                        actor,
                        payload: {
                            messageId: id,
                            channel: message.channel,
                            template: message.template,
                            previousAttempts: message.attempts,
                        },
                        refs: [id, ...(message.campaignId ? [message.campaignId] : [])],
                    },
                ],
            };
        });
    }
    toData(input) {
        return {
            ...(input.campaignId
                ? { campaign: { connect: { id: input.campaignId } } }
                : {}),
            channel: input.channel,
            recipient: input.recipient,
            template: input.template,
            payload: (input.payload ?? {}),
        };
    }
};
exports.OutboxService = OutboxService;
exports.OutboxService = OutboxService = OutboxService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(outbox_types_1.NOTIFICATION_TRANSPORT)),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, audit_service_1.AuditService])
], OutboxService);
function durableMessageId(input) {
    const fingerprint = [
        input.channel,
        input.recipient,
        input.template,
        input.dedupKey,
    ].join('\u001f');
    return `outbox_dedup_${(0, node_crypto_1.createHash)('sha256').update(fingerprint).digest('hex')}`;
}
//# sourceMappingURL=outbox.service.js.map