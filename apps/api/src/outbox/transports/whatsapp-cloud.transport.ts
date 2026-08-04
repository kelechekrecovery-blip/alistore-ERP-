import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
import { notificationText } from './message-text';

@Injectable()
export class WhatsAppCloudTransport implements NotificationTransport {
  private readonly apiUrl: string;
  private readonly apiVersion: string;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(config: ConfigService) {
    this.apiUrl = (
      config.get<string>('WHATSAPP_API_URL') ?? 'https://graph.facebook.com'
    ).replace(/\/$/, '');
    this.apiVersion = config.get<string>('WHATSAPP_API_VERSION') ?? 'v20.0';
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN') ?? '';
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: whatsappRecipient(message.recipient),
          type: 'text',
          text: { body: notificationText(message) },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `WhatsApp message failed: ${response.status} ${body}`.trim(),
      );
    }
  }
}

function whatsappRecipient(recipient: string): string {
  return recipient.replace(/\D/g, '');
}
