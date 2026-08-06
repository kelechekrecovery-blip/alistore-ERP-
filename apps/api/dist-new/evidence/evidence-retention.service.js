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
var EvidenceRetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvidenceRetentionService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const media_service_1 = require("../media/media.service");
const prisma_service_1 = require("../prisma/prisma.service");
const RETENTION_SWEEP_MS = 60 * 60_000;
const CLAIM_STALE_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 24 * 60 * 60_000;
let EvidenceRetentionService = EvidenceRetentionService_1 = class EvidenceRetentionService {
    constructor(prisma, media, audit) {
        this.prisma = prisma;
        this.media = media;
        this.audit = audit;
        this.logger = new common_1.Logger(EvidenceRetentionService_1.name);
    }
    onModuleInit() {
        void this.runDuePurges();
        this.timer = setInterval(() => void this.runDuePurges(), RETENTION_SWEEP_MS);
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async runDuePurges(limit = 50) {
        const now = new Date();
        const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
        const candidates = await this.prisma.evidenceUpload.findMany({
            where: {
                isPii: true,
                purgedAt: null,
                retentionUntil: { lte: now },
                OR: [
                    { nextPurgeAt: null },
                    { nextPurgeAt: { lte: now } },
                ],
                AND: [
                    { OR: [{ purgeRequestedAt: null }, { purgeRequestedAt: { lte: staleBefore } }] },
                ],
            },
            orderBy: { retentionUntil: 'asc' },
            take: limit,
        });
        let purged = 0;
        let failed = 0;
        for (const candidate of candidates) {
            const claimedAt = new Date();
            const claimed = await this.prisma.evidenceUpload.updateMany({
                where: {
                    id: candidate.id,
                    isPii: true,
                    purgedAt: null,
                    retentionUntil: { lte: now },
                    OR: [{ purgeRequestedAt: null }, { purgeRequestedAt: { lte: staleBefore } }],
                },
                data: { purgeRequestedAt: claimedAt },
            });
            if (claimed.count !== 1)
                continue;
            const storedAsset = candidate.asset;
            const objectKey = typeof storedAsset.key === 'string' ? storedAsset.key : null;
            if (!objectKey) {
                await this.recordFailure(candidate.id, claimedAt, 'evidence_asset_key_missing');
                failed += 1;
                continue;
            }
            try {
                await this.media.deleteImage(objectKey);
                const finalized = await this.audit.transaction(async (tx) => {
                    const result = await tx.evidenceUpload.updateMany({
                        where: { id: candidate.id, purgedAt: null, purgeRequestedAt: claimedAt },
                        data: {
                            asset: {
                                purged: true,
                                format: storedAsset.format ?? null,
                                width: storedAsset.width ?? null,
                                height: storedAsset.height ?? null,
                                bytes: storedAsset.bytes ?? null,
                            },
                            purgedAt: new Date(),
                            purgeRequestedAt: null,
                            purgeReason: 'retention_expired',
                            nextPurgeAt: null,
                        },
                    });
                    return {
                        result: result.count === 1,
                        events: result.count === 1
                            ? [{
                                    type: event_types_1.EventType.EvidencePurged,
                                    actor: 'system:evidence-retention',
                                    payload: {
                                        entityType: candidate.entityType,
                                        entityId: candidate.entityId,
                                        policy: 'kg-privacy-v1',
                                        reason: 'retention_expired',
                                        objectKeySha256: (0, node_crypto_1.createHash)('sha256').update(objectKey).digest('hex'),
                                    },
                                    refs: [candidate.id, candidate.entityId],
                                }]
                            : [],
                    };
                });
                if (finalized)
                    purged += 1;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'unknown evidence purge error';
                await this.recordFailure(candidate.id, claimedAt, message);
                this.logger.warn(`Evidence retention purge failed for ${candidate.id}: ${message}`);
                failed += 1;
            }
        }
        return { purged, failed };
    }
    async recordFailure(id, claimedAt, message) {
        const row = await this.prisma.evidenceUpload.findUnique({ where: { id }, select: { purgeAttempts: true } });
        const attempts = (row?.purgeAttempts ?? 0) + 1;
        const delay = Math.min(2 ** Math.min(attempts, 10) * 60_000, MAX_BACKOFF_MS);
        await this.prisma.evidenceUpload.updateMany({
            where: { id, purgedAt: null, purgeRequestedAt: claimedAt },
            data: {
                purgeAttempts: attempts,
                purgeRequestedAt: null,
                nextPurgeAt: new Date(Date.now() + delay),
                purgeReason: message.slice(0, 500),
            },
        });
    }
};
exports.EvidenceRetentionService = EvidenceRetentionService;
exports.EvidenceRetentionService = EvidenceRetentionService = EvidenceRetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        media_service_1.MediaService,
        audit_service_1.AuditService])
], EvidenceRetentionService);
//# sourceMappingURL=evidence-retention.service.js.map