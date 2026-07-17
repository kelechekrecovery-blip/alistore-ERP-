import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_TRANSPORT,
  NotificationTransport,
  OutboxInput,
} from './outbox.types';

const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60 * 60 * 1_000;

/**
 * Transactional outbox. Producers enqueue a message in the SAME transaction as
 * their business change (invariant #10) so a committed change always has its
 * notification queued and a rolled-back one never does. The OutboxRelay then
 * ships pending messages out-of-band with retries.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_TRANSPORT)
    private readonly transport: NotificationTransport,
  ) {}

  /** Enqueue inside an existing transaction (atomic with the business change). */
  async enqueueOnTx(
    tx: Prisma.TransactionClient,
    input: OutboxInput,
  ): Promise<void> {
    await tx.outboxMessage.create({ data: this.toData(input) });
  }

  /** Fire-and-forget enqueue outside a transaction. */
  async enqueue(input: OutboxInput): Promise<void> {
    await this.prisma.outboxMessage.create({ data: this.toData(input) });
  }

  /**
   * Delivery pass: pick pending messages and deliver each via the transport.
   * Per-message isolation — one failure never blocks the rest; a failing message
   * is retried up to MAX_ATTEMPTS, then parked as `failed`. Idempotent: only
   * `pending` rows are considered, so an already-sent message is never re-sent.
   */
  async relayPending(limit = 50): Promise<{ sent: number; failed: number }> {
    const pending = await this.prisma.outboxMessage.findMany({
      where: { status: 'pending', attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let sent = 0;
    let failed = 0;
    for (const message of pending) {
      try {
        await this.transport.deliver({
          channel: message.channel,
          recipient: message.recipient,
          template: message.template,
          payload: message.payload,
        });
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: { status: 'sent', sentAt: new Date(), nextAttemptAt: null },
        });
        sent += 1;
      } catch (err) {
        const attempts = message.attempts + 1;
        const capped = attempts >= MAX_ATTEMPTS;
        const delayMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: {
            attempts,
            lastError: err instanceof Error ? err.message : 'unknown error',
            status: capped ? 'failed' : 'pending',
            nextAttemptAt: capped ? null : new Date(Date.now() + delayMs),
          },
        });
        if (capped) failed += 1;
        this.logger.warn(
          `Outbox delivery failed (${message.channel} ${message.id}), attempt ${attempts}`,
        );
      }
    }
    return { sent, failed };
  }

  private toData(input: OutboxInput): Prisma.OutboxMessageCreateInput {
    return {
      ...(input.campaignId
        ? { campaign: { connect: { id: input.campaignId } } }
        : {}),
      channel: input.channel,
      recipient: input.recipient,
      template: input.template,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    };
  }
}
