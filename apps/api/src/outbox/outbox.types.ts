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
  channel: OutboxChannel;
  recipient: string;
  template: string;
  payload?: Record<string, unknown>;
}

export interface DeliverableMessage {
  channel: string;
  recipient: string;
  template: string;
  payload: Prisma.JsonValue;
}

/** Pluggable delivery port — swap LogNotificationTransport for Novu/SMS later. */
export interface NotificationTransport {
  deliver(message: DeliverableMessage): Promise<void>;
}

export const NOTIFICATION_TRANSPORT = Symbol('NOTIFICATION_TRANSPORT');
