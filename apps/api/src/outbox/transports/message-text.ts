import { DeliverableMessage } from '../outbox.types';

export function notificationText(message: DeliverableMessage): string {
  const payload = message.payload ?? {};
  const explicitMessage = payloadField(payload, 'message');
  if (explicitMessage) return explicitMessage;

  const details = JSON.stringify(payload, null, 2);
  return details && details !== '{}'
    ? `AliStore: ${message.template}\n${details}`
    : `AliStore: ${message.template}`;
}

function payloadField(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
