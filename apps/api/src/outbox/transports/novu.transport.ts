import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliverableMessage,
  NotificationDeliveryError,
  NotificationTransport,
} from '../outbox.types';

const TERMINAL_STATUSES = new Set([
  'trigger_not_active',
  'no_workflow_active_steps_defined',
  'no_workflow_steps_defined',
  'invalid_recipients',
]);

/**
 * Delivers outbox messages through Novu's REST trigger API
 * (`POST {NOVU_API_URL}/v1/events/trigger`). Works against Novu Cloud or a
 * self-hosted Novu — point NOVU_API_URL at the instance.
 *
 * The outbox `template` maps to a Novu workflow trigger identifier and
 * `recipient` becomes the subscriber. A non-2xx response throws, so the
 * OutboxRelay retries. Uses global fetch (Node 20+) — no SDK dependency, so the
 * integration can't drift with an SDK's changing surface.
 */
@Injectable()
export class NovuHttpTransport implements NotificationTransport {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiUrl = config.get<string>('NOVU_API_URL') ?? 'https://api.novu.co';
    this.apiKey = config.get<string>('NOVU_API_KEY') ?? '';
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    const response = await fetch(`${this.apiUrl}/v1/events/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${this.apiKey}`,
        ...(message.idempotencyKey
          ? { 'idempotency-key': message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        name: message.template,
        to: { subscriberId: message.recipient, phone: message.recipient },
        payload: message.payload ?? {},
        ...(message.idempotencyKey
          ? { transactionId: message.idempotencyKey }
          : {}),
      }),
      signal: message.signal,
    });

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(
        `Novu trigger failed: ${response.status} ${text}`.trim(),
      );
    }
    const body = parseNovuResponse(text);
    const result = isRecord(body.data) ? body.data : body;
    const acknowledged = result.acknowledged;
    const status = typeof result.status === 'string' ? result.status : undefined;
    if (acknowledged === true && (!status || status === 'processed')) return;

    const label = status ?? 'invalid_response';
    throw new NotificationDeliveryError(
      `Novu trigger rejected: ${label}`,
      !TERMINAL_STATUSES.has(label),
    );
  }
}

function parseNovuResponse(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
