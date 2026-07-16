import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_UPLOAD_TIMEOUT_MS, MediaService } from './media.service';

const RETRY_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const STALE_CLAIM_MS = 5 * 60_000;
const UPLOAD_LEASE_MS = 5 * 60_000;
const LATE_UPLOAD_SETTLE_MS = MEDIA_UPLOAD_TIMEOUT_MS + 30_000;

@Injectable()
export class MediaCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  onModuleInit(): void {
    void this.runPendingCleanup();
    this.timer = setInterval(() => void this.runPendingCleanup(), RETRY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async deleteOrSchedule(objectKey: string): Promise<void> {
    const now = new Date();
    await this.prisma.mediaCleanupTask.upsert({
      where: { objectKey },
      create: { objectKey, uploadLeaseUntil: now },
      update: {
        completedAt: null,
        claimedAt: null,
        deletePasses: 0,
        uploadLeaseUntil: now,
        nextAttemptAt: now,
      },
    });
    const claim = await this.claim(objectKey);
    if (!claim) return;
    try {
      await this.media.deleteImage(objectKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown media deletion error';
      this.logger.error(`Media compensation failed for ${objectKey}; queued for retry: ${message}`);
      await this.prisma.mediaCleanupTask.upsert({
        where: { objectKey },
        create: { objectKey, uploadLeaseUntil: new Date(), attempts: 1, lastError: message },
        update: {
          attempts: { increment: 1 },
          lastError: message,
          completedAt: null,
          claimedAt: null,
          nextAttemptAt: new Date(),
        },
      });
      return;
    }
    await this.finalizeDeletePass({ objectKey, deletePasses: 0 }, claim);
  }

  async registerIntent(objectKey: string): Promise<void> {
    const uploadLeaseUntil = new Date(Date.now() + UPLOAD_LEASE_MS);
    await this.prisma.mediaCleanupTask.upsert({
      where: { objectKey },
      create: { objectKey, uploadLeaseUntil },
      update: {
        completedAt: null,
        claimedAt: null,
        deletePasses: 0,
        lastError: null,
        nextAttemptAt: new Date(),
        uploadLeaseUntil,
      },
    });
  }

  async markRetainedOnTx(tx: Prisma.TransactionClient, objectKey: string): Promise<void> {
    const updated = await tx.mediaCleanupTask.updateMany({
      where: {
        objectKey,
        completedAt: null,
        claimedAt: null,
        uploadLeaseUntil: { gt: new Date() },
      },
      data: { completedAt: new Date(), lastError: null },
    });
    if (updated.count !== 1) {
      throw new Error(`media cleanup intent missing for ${objectKey}`);
    }
  }

  async runPendingCleanup(): Promise<void> {
    try {
      await this.retryPending();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown cleanup queue error';
      this.logger.error(`Media cleanup pass failed; durable tasks remain pending: ${message}`);
    }
  }

  async retryPending(limit = 25): Promise<{ completed: number; failed: number }> {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    const tasks = await this.prisma.mediaCleanupTask.findMany({
      where: {
        completedAt: null,
        nextAttemptAt: { lte: new Date() },
        uploadLeaseUntil: { lte: new Date() },
        OR: [{ claimedAt: null }, { claimedAt: { lte: staleBefore } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let completed = 0;
    let failed = 0;
    for (const task of tasks) {
      const claim = await this.claim(task.objectKey, staleBefore);
      if (!claim) continue;
      try {
        await this.media.deleteImage(task.objectKey);
      } catch (error) {
        const attempts = task.attempts + 1;
        const message = error instanceof Error ? error.message : 'unknown media deletion error';
        const delay = Math.min(2 ** Math.min(attempts, 10) * 1_000, MAX_BACKOFF_MS);
        const rescheduled = await this.prisma.mediaCleanupTask.updateMany({
          where: { id: task.id, completedAt: null, claimedAt: claim },
          data: { attempts, claimedAt: null, lastError: message, nextAttemptAt: new Date(Date.now() + delay) },
        });
        if (rescheduled.count === 1) {
          this.logger.warn(`Media cleanup retry failed for ${task.objectKey}, attempt ${attempts}`);
          failed += 1;
        }
        continue;
      }
      const finalized = await this.finalizeDeletePass(task, claim);
      if (finalized.count === 1 && task.deletePasses >= 1) completed += 1;
    }
    return { completed, failed };
  }

  private finalizeDeletePass(
    task: { id?: string; objectKey: string; deletePasses: number },
    claim: Date,
  ): Promise<{ count: number }> {
    const where = task.id
      ? { id: task.id, completedAt: null, claimedAt: claim }
      : { objectKey: task.objectKey, completedAt: null, claimedAt: claim };
    if (task.deletePasses >= 1) {
      return this.prisma.mediaCleanupTask.updateMany({
        where,
        data: { deletePasses: { increment: 1 }, completedAt: new Date(), lastError: null },
      });
    }
    return this.prisma.mediaCleanupTask.updateMany({
      where,
      data: {
        deletePasses: { increment: 1 },
        claimedAt: null,
        lastError: null,
        nextAttemptAt: new Date(Date.now() + LATE_UPLOAD_SETTLE_MS),
      },
    });
  }

  private async claim(objectKey: string, staleBefore = new Date(0)): Promise<Date | null> {
    const claimedAt = new Date();
    const claimed = await this.prisma.mediaCleanupTask.updateMany({
      where: {
        objectKey,
        completedAt: null,
        uploadLeaseUntil: { lte: new Date() },
        OR: [{ claimedAt: null }, { claimedAt: { lte: staleBefore } }],
      },
      data: { claimedAt },
    });
    return claimed.count === 1 ? claimedAt : null;
  }
}
