import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
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
const CLAIM_LEASE_MS = 5 * 60 * 1_000;

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

  /** Fire-and-forget enqueue outside a transaction. */
  async enqueue(input: OutboxInput): Promise<void> {
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

  /**
   * Delivery pass: pick pending messages and deliver each via the transport.
   * Per-message isolation — one failure never blocks the rest; a failing message
   * is retried up to MAX_ATTEMPTS, then parked as `failed`. Idempotent: only
   * `pending` rows are considered, so an already-sent message is never re-sent.
   */
  async relayPending(limit = 50): Promise<{ sent: number; failed: number }> {
    const now = new Date();
    const pending = await this.prisma.outboxMessage.findMany({
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        OR: [
          { status: 'pending', nextAttemptAt: { lte: now } },
          // A crashed worker leaves a processing row behind. Its lease is
          // eligible for one new claimant after the deadline.
          { status: 'processing', nextAttemptAt: { lte: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let sent = 0;
    let failed = 0;
    for (const message of pending) {
      // Multiple API/worker processes can read the same pending snapshot. Claim
      // the row before calling an external provider so only one relay owns the
      // delivery attempt. Telegram replies use their identity/subject lock in
      // deliverTelegramAgentReply and remain pending until that transaction.
      const isTelegramAgentReply = message.channel === 'telegram' && message.template === 'telegram_agent_reply';
      const processingToken = isTelegramAgentReply ? null : randomUUID();
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
      if (claimed.count !== 1) continue;
      const deliveryWhere = isTelegramAgentReply
        ? { id: message.id, status: 'pending' as const }
        : { id: message.id, status: 'processing' as const, processingToken };
      try {
        if (message.channel === 'telegram' && message.template === 'telegram_agent_reply') {
          const outcome = await this.deliverTelegramAgentReply(message);
          if (outcome === 'sent') sent += 1;
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
      } catch (err) {
        const attempts = message.attempts + 1;
        const capped = attempts >= MAX_ATTEMPTS;
        const delayMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
        const data = {
          attempts,
          lastError: err instanceof Error ? err.message : 'unknown error',
          status: capped ? 'failed' as const : 'pending' as const,
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
        if (capped && updated.count === 1) failed += 1;
        this.logger.warn(
          `Outbox delivery failed (${message.channel} ${message.id}), attempt ${attempts}`,
        );
      }
    }
    return { sent, failed };
  }

  /**
   * Telegram-agent replies are delivered while holding the linked identity and
   * subject rows. Lifecycle revocation takes the same locks before cancelling
   * queued replies, giving deactivation/deletion a linearizable delivery fence.
   */
  private async deliverTelegramAgentReply(
    message: {
      id: string;
      recipient: string;
      channel: string;
      template: string;
      payload: Prisma.JsonValue;
    },
  ): Promise<'sent' | 'cancelled' | 'skipped'> {
    const botId = typeof message.payload === 'object' && message.payload !== null && !Array.isArray(message.payload)
      ? String((message.payload as Record<string, unknown>).botId ?? 'legacy')
      : 'legacy';
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.telegramAgentIdentity.findFirst({
        where: { chatId: message.recipient, botId },
        select: { id: true, staffId: true, customerId: true },
      });
      if (initial?.staffId) {
        await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${initial.staffId} FOR UPDATE`;
      } else if (initial?.customerId) {
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${initial.customerId} FOR UPDATE`;
      }
      if (initial) {
        await tx.$queryRaw`SELECT id FROM "TelegramAgentIdentity" WHERE id = ${initial.id} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM "OutboxMessage" WHERE id = ${message.id} FOR UPDATE`;
      // A second relay may have waited on the subject/identity lock while the
      // first delivered and committed. Read the outbox state again only after
      // those locks are held; never trust relayPending()'s earlier snapshot.
      const queued = await tx.outboxMessage.findUnique({
        where: { id: message.id },
        select: { status: true },
      });
      if (queued?.status !== 'pending') return 'skipped';
      const identity = initial
        ? await tx.telegramAgentIdentity.findUnique({
            where: { id: initial.id },
            include: {
              staff: { select: { active: true, role: true } },
              customer: { select: { phone: true } },
            },
          })
        : null;
      const active = Boolean(
        identity?.active &&
        (identity.kind === 'staff'
          ? identity.staff?.active && ['admin', 'owner'].includes(identity.staff.role)
          : identity.customer && !identity.customer.phone.startsWith('deleted:')),
      );
      const allowUnlinked = !initial && typeof message.payload === 'object' && message.payload !== null && !Array.isArray(message.payload)
        && (message.payload as Record<string, unknown>).allowUnlinked === true;
      if (!active && !allowUnlinked) {
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

function durableMessageId(input: OutboxInput): string {
  const fingerprint = [
    input.channel,
    input.recipient,
    input.template,
    input.dedupKey,
  ].join('\u001f');
  return `outbox_dedup_${createHash('sha256').update(fingerprint).digest('hex')}`;
}
