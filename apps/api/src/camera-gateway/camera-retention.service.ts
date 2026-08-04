import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const SWEEP_MS = 60 * 60_000;

/** Removes camera metadata after TTL while keeping an auditable tombstone. */
@Injectable()
export class CameraRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CameraRetentionService.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  onModuleInit(): void { void this.purgeExpired(); this.timer = setInterval(() => void this.purgeExpired(), SWEEP_MS); this.timer.unref(); }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async purgeExpired(now = new Date(), limit = 100): Promise<number> {
    const rows = await this.prisma.cameraDetection.findMany({ where: { purgedAt: null, retentionUntil: { lte: now } }, select: { id: true, storePointId: true, edgeDeviceId: true }, take: limit });
    let purged = 0;
    for (const row of rows) {
      const result = await this.audit.transaction(async (tx) => {
        const updated = await tx.cameraDetection.updateMany({ where: { id: row.id, purgedAt: null, retentionUntil: { lte: now } }, data: { value: { purged: true }, evidenceRef: null, purgedAt: new Date(), purgeReason: 'retention_expired' } });
        return { result: updated.count === 1, events: updated.count === 1 ? [{ type: 'camera.detection_purged', actor: 'system:camera-retention', payload: { detectionId: row.id, reason: 'retention_expired' }, refs: [row.id, row.edgeDeviceId, row.storePointId] }] : [] };
      });
      if (result) purged += 1;
    }
    if (rows.length > 0 && purged < rows.length) this.logger.warn(`Camera retention purged ${purged}/${rows.length}`);
    return purged;
  }
}
