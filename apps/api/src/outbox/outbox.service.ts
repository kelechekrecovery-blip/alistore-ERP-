import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
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
    // Optional so existing unit constructions with two args keep working; Nest
    // always injects it (AuditModule is global).
    @Optional() private readonly audit?: AuditService,
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

  /**
   * Operator re-drive (LOGIC-013): return a `failed` message to the pending
   * queue with the attempt counter and schedule reset, so the relay picks it up
   * on the next pass. Writes an `outbox.redriven` ledger event naming the
   * operator in the same transaction. State-guarded: only a failed message can
   * be re-driven — a repeated request is a 409, never a duplicate enqueue.
   */
  async redrive(id: string, actor: string) {
    const audit = this.audit ?? new AuditService(this.prisma);
    return audit.transaction(async (tx) => {
      const message = await tx.outboxMessage.findUnique({ where: { id } });
      if (!message) {
        throw new ValidationError('outbox_message_not_found', 'Сообщение outbox не найдено');
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
        throw new ConflictError(
          'outbox_message_not_failed',
          'Повторно в очередь можно вернуть только сообщение со статусом failed',
        );
      }
      const result = await tx.outboxMessage.findUniqueOrThrow({ where: { id } });
      return {
        result,
        events: [
          {
            type: EventType.OutboxMessageRedriven,
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
