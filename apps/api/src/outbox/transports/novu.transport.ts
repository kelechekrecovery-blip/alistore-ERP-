import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

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
      },
      body: JSON.stringify({
        name: message.template,
        to: { subscriberId: message.recipient, phone: message.recipient },
        payload: message.payload ?? {},
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Novu trigger failed: ${response.status} ${body}`.trim(),
      );
    }
  }
}
