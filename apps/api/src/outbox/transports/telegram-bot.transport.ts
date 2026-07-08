import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
import { notificationText } from './message-text';

@Injectable()
export class TelegramBotTransport implements NotificationTransport {
  private readonly apiUrl: string;
  private readonly botToken: string;

  constructor(config: ConfigService) {
    this.apiUrl = (
      config.get<string>('TELEGRAM_API_URL') ?? 'https://api.telegram.org'
    ).replace(/\/$/, '');
    this.botToken = config.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    const response = await fetch(`${this.apiUrl}/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.recipient,
        text: notificationText(message),
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Telegram sendMessage failed: ${response.status} ${body}`.trim(),
      );
    }
  }
}
