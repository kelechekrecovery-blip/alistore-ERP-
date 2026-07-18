import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_SWEEP_MS = 60 * 60_000;
const CLAIM_STALE_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 24 * 60 * 60_000;

@Injectable()
export class EvidenceRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvidenceRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    void this.runDuePurges();
    this.timer = setInterval(() => void this.runDuePurges(), RETENTION_SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runDuePurges(limit = 50): Promise<{ purged: number; failed: number }> {
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
      if (claimed.count !== 1) continue;

      const storedAsset = candidate.asset as Prisma.JsonObject;
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
              } as Prisma.InputJsonValue,
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
                type: EventType.EvidencePurged,
                actor: 'system:evidence-retention',
                payload: {
                  entityType: candidate.entityType,
                  entityId: candidate.entityId,
                  policy: 'kg-privacy-v1',
                  reason: 'retention_expired',
                  objectKeySha256: createHash('sha256').update(objectKey).digest('hex'),
                },
                refs: [candidate.id, candidate.entityId],
              }]
              : [],
          };
        });
        if (finalized) purged += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown evidence purge error';
        await this.recordFailure(candidate.id, claimedAt, message);
        this.logger.warn(`Evidence retention purge failed for ${candidate.id}: ${message}`);
        failed += 1;
      }
    }
    return { purged, failed };
  }

  private async recordFailure(id: string, claimedAt: Date, message: string): Promise<void> {
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
}
