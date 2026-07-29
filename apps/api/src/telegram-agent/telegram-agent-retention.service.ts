import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_SWEEP_MS = 60 * 60_000;
const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RETENTION_BATCH_SIZE = 500;
const RETENTION_MAX_BATCHES = 100;

/**
 * Deletes expired Telegram inbox/reply traces independently of bot traffic.
 * The worker is always registered, even while Telegram Agent is disabled, so
 * disabling the feature cannot suspend deletion of previously collected PII.
 */
@Injectable()
export class TelegramAgentRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAgentRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), RETENTION_SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeExpired(now = new Date()): Promise<{ purged: number; redactedOutbox: number }> {
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
      if (expired.length < RETENTION_BATCH_SIZE && outbox.length < RETENTION_BATCH_SIZE) break;
    }
    return { purged, redactedOutbox };
  }

  private async sweep(): Promise<void> {
    try {
      const { purged, redactedOutbox } = await this.purgeExpired();
      if (purged > 0 || redactedOutbox > 0) {
        this.logger.log(
          `Telegram retention: deleted messages=${purged}, redacted outbox=${redactedOutbox}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown Telegram retention error';
      this.logger.warn(`Telegram agent retention sweep failed: ${message}`);
    }
  }
}
