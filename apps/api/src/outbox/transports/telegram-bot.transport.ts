import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';
import { notificationText } from './message-text';

@Injectable()
export class TelegramBotTransport implements NotificationTransport {
  private readonly apiUrl: string;
  private readonly botToken: string;
  private readonly supportBotToken: string;
  private readonly opsBotToken: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiUrl = (
      config.get<string>('TELEGRAM_API_URL') ?? 'https://api.telegram.org'
    ).replace(/\/$/, '');
    this.botToken = config.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
    this.supportBotToken = config.get<string>('TELEGRAM_SUPPORT_BOT_TOKEN') ?? '';
    this.opsBotToken = config.get<string>('TELEGRAM_OPS_BOT_TOKEN') ?? '';
    const configuredTimeout = Number(config.get<string>('TELEGRAM_REQUEST_TIMEOUT_MS') ?? 3_000);
    this.timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.min(4_000, Math.max(1_000, configuredTimeout))
      : 3_000;
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const botId = typeof message.payload === 'object' && message.payload !== null && !Array.isArray(message.payload)
        ? String((message.payload as Record<string, unknown>).botId ?? 'legacy')
        : 'legacy';
      const token = botId === 'support' ? this.supportBotToken : botId === 'ops' ? this.opsBotToken : this.botToken;
      if (!token) throw new Error(`Telegram bot token is not configured for profile: ${botId}`);
      const response = await fetch(`${this.apiUrl}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.recipient,
          text: notificationText(message),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `Telegram sendMessage failed: ${response.status} ${body}`.trim(),
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
