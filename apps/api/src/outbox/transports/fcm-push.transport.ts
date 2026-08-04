import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FCM_TOKEN_PATTERN } from '../../notifications/push-token.dto';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEAD_TOKEN_CODES = new Set(['UNREGISTERED']);

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface FcmMessage {
  token: string;
  notification: { title: string; body: string };
  data: Record<string, string>;
  android: {
    priority: 'HIGH';
    notification: { channel_id: string; click_action: string };
  };
}

export interface FcmSendResult {
  ok: boolean;
  status: number;
  code?: string;
}

export interface FcmSender {
  send(message: FcmMessage): Promise<FcmSendResult>;
}

export class FcmPushTransport implements NotificationTransport {
  private readonly sender: FcmSender;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    sender?: FcmSender,
  ) {
    this.sender = sender ?? new FcmHttpV1Sender(resolveServiceAccount(config));
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    const tokens = await this.resolveTokens(message.recipient);
    if (tokens.length === 0) {
      throw new Error(`push_recipient_unavailable: no active FCM tokens for ${message.recipient}`);
    }

    const payload = jsonObject(message.payload);
    const results = await Promise.all(tokens.map(async (token) => ({
      token,
      result: await this.sender.send(this.toMessage(token, message, payload)),
    })));
    const dead = results.filter(({ result }) => !result.ok && DEAD_TOKEN_CODES.has(result.code ?? ''))
      .map(({ token }) => token);
    if (dead.length > 0) {
      await this.prisma.pushToken.updateMany({ where: { token: { in: dead } }, data: { enabled: false } });
    }
    const retryable = results.filter(({ result }) => !result.ok && !DEAD_TOKEN_CODES.has(result.code ?? ''));
    if (retryable.length > 0) {
      throw new Error(`FCM push failed: ${retryable.map(({ result }) => result.code ?? `HTTP_${result.status}`).join('; ')}`);
    }
  }

  private async resolveTokens(recipient: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: {
        enabled: true,
        platform: 'android',
        OR: [{ customerId: recipient }, { staffId: recipient }],
      },
      select: { token: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
    const registered = rows.map((row) => row.token).filter((token) => FCM_TOKEN_PATTERN.test(token));
    if (registered.length > 0) return registered;
    return FCM_TOKEN_PATTERN.test(recipient) ? [recipient] : [];
  }

  private toMessage(
    token: string,
    message: DeliverableMessage,
    payload: Record<string, unknown>,
  ): FcmMessage {
    const title = text(payload.title) ?? 'AliStore';
    const body = text(payload.message) ?? text(payload.body) ?? titleFor(message.template);
    return {
      token,
      notification: { title, body },
      data: stringData({ ...payload, template: message.template }),
      android: {
        priority: 'HIGH',
        notification: { channel_id: 'operations', click_action: 'ALISTORE_STAFF_PUSH' },
      },
    };
  }
}

class FcmHttpV1Sender implements FcmSender {
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly account: ServiceAccount) {}

  async send(message: FcmMessage): Promise<FcmSendResult> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    );
    if (response.ok) return { ok: true, status: response.status };
    const body = await responseJson(response);
    return { ok: false, status: response.status, code: fcmErrorCode(body) };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt > now + 60_000) return this.accessToken.value;

    const tokenUri = this.account.token_uri?.trim() || DEFAULT_TOKEN_URI;
    const assertion = serviceAccountAssertion(this.account, tokenUri, Math.floor(now / 1000));
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const body = await responseJson(response);
    const value = stringField(body, 'access_token');
    if (!response.ok || !value) {
      throw new Error(`FCM OAuth failed: ${response.status}`);
    }
    const expiresIn = numberField(body, 'expires_in') ?? 3600;
    this.accessToken = { value, expiresAt: now + Math.max(60, expiresIn) * 1000 };
    return value;
  }
}

function resolveServiceAccount(config: ConfigService): ServiceAccount {
  const inline = config.get<string>('FCM_SERVICE_ACCOUNT_JSON')?.trim();
  const path = config.get<string>('FCM_SERVICE_ACCOUNT_KEY_PATH')?.trim();
  if (!inline && !path) throw new Error('FCM service account configuration is required');
  const raw = inline ?? readFileSync(path!, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FCM service account configuration is invalid JSON');
  }
  if (!isObject(parsed)
    || !stringField(parsed, 'project_id')
    || !stringField(parsed, 'client_email')
    || !stringField(parsed, 'private_key')) {
    throw new Error('FCM service account configuration is incomplete');
  }
  return parsed as unknown as ServiceAccount;
}

function serviceAccountAssertion(account: ServiceAccount, audience: string, issuedAt: number): string {
  const encodedHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const encodedClaims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: audience,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${encodedHeader}.${encodedClaims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(account.private_key).toString('base64url')}`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function fcmErrorCode(body: unknown): string | undefined {
  if (!isObject(body) || !isObject(body.error)) return undefined;
  const details = Array.isArray(body.error.details) ? body.error.details : [];
  for (const detail of details) {
    if (isObject(detail) && stringField(detail, 'errorCode')) return stringField(detail, 'errorCode');
  }
  return stringField(body.error, 'status');
}

function jsonObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringData(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (typeof item === 'string') return [[key, item]];
    if (typeof item === 'number' || typeof item === 'boolean') return [[key, String(item)]];
    return [];
  }));
}

function stringField(value: unknown, key: string): string | undefined {
  return isObject(value) && typeof value[key] === 'string' && value[key].trim().length > 0
    ? value[key]
    : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  return isObject(value) && typeof value[key] === 'number' ? value[key] : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function titleFor(template: string): string {
  return template.split(/[_\s-]+/).filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join(' ');
}
