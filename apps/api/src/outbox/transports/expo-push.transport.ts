import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

const EXPO_PUSH_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
}

@Injectable()
export class ExpoPushTransport implements NotificationTransport {
  private readonly apiUrl: string;
  private readonly accessToken?: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiUrl = config.get<string>('EXPO_PUSH_API_URL') ?? 'https://exp.host/--/api/v2/push/send';
    this.accessToken = config.get<string>('EXPO_PUSH_ACCESS_TOKEN')?.trim() || undefined;
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    const tokens = await this.resolveTokens(message.recipient);
    if (tokens.length === 0) return;

    const payload = jsonObject(message.payload);
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(tokens.map((token) => this.toExpoMessage(token, message, payload))),
    });

    const body = await readExpoResponse(response);
    if (!response.ok || body.errors?.length) {
      throw new Error(`Expo push send failed: ${response.status} ${JSON.stringify(body.errors ?? body)}`);
    }

    const tickets = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    const retryableErrors: string[] = [];
    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index];
      if (ticket?.status !== 'error') continue;
      const token = tokens[index];
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await this.disableToken(token);
      } else {
        retryableErrors.push(ticket.message ?? ticket.details?.error ?? 'unknown Expo push ticket error');
      }
    }
    if (retryableErrors.length > 0) {
      throw new Error(`Expo push ticket failed: ${retryableErrors.join('; ')}`);
    }
  }

  private async resolveTokens(recipient: string): Promise<string[]> {
    if (EXPO_PUSH_TOKEN.test(recipient)) return [recipient];
    const rows = await this.prisma.pushToken.findMany({
      where: {
        enabled: true,
        OR: [
          { customerId: recipient },
          { staffId: recipient },
        ],
      },
      select: { token: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => row.token).filter((token) => EXPO_PUSH_TOKEN.test(token));
  }

  private toExpoMessage(
    token: string,
    message: DeliverableMessage,
    payload: Record<string, unknown>,
  ) {
    return {
      to: token,
      title: text(payload.title) ?? 'AliStore',
      body: text(payload.message) ?? text(payload.body) ?? titleFor(message.template),
      data: {
        ...payload,
        template: message.template,
        recipient: message.recipient,
      },
      sound: 'default',
      priority: 'default',
      channelId: 'orders',
    };
  }

  private async disableToken(token: string): Promise<void> {
    await this.prisma.pushToken.updateMany({
      where: { token },
      data: { enabled: false },
    });
  }
}

async function readExpoResponse(response: Response): Promise<ExpoPushResponse> {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text) as ExpoPushResponse;
  } catch {
    return { errors: [{ message: text }] };
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function titleFor(template: string): string {
  return template
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
