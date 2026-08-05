import { Prisma } from '@prisma/client';

/**
 * Channels the outbox can deliver to. Kept as string literals (not a DB enum) so
 * adding a channel never needs a migration.
 */
export type OutboxChannel =
  | 'sms'
  | 'email'
  | 'push'
  | 'telegram'
  | 'whatsapp'
  | 'webhook';

export interface OutboxInput {
  campaignId?: string;
  /**
   * Stable business-event key. When supplied, enqueue becomes an immutable
   * upsert so scheduler/webhook retries cannot create duplicate delivery rows.
   */
  dedupKey?: string;
  channel: OutboxChannel;
  recipient: string;
  template: string;
  payload?: Record<string, unknown>;
}

export interface DeliverableMessage {
  /** Stable outbox row ID for provider-side idempotency where supported. */
  idempotencyKey?: string;
  /** Provider adapters must abort network work when this signal fires. */
  signal?: AbortSignal;
  channel: string;
  recipient: string;
  template: string;
  payload: Prisma.JsonValue;
}

/** Pluggable delivery port — swap LogNotificationTransport for Novu/SMS later. */
export interface NotificationTransport {
  deliver(message: DeliverableMessage): Promise<void>;
}

export class NotificationDeliveryError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}

export const NOTIFICATION_TRANSPORT = Symbol('NOTIFICATION_TRANSPORT');
