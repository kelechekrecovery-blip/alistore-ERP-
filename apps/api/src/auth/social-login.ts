import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifyCrypto,
} from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { ValidationError } from '../common/errors';

export type SocialProvider = 'telegram' | 'apple';
export type TelegramAuthSource = 'mini_app' | 'login_widget';

export interface SocialProfile {
  provider: SocialProvider;
  subject: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface TelegramLoginInput {
  initData: string;
  source?: TelegramAuthSource;
  now?: Date;
  maxAgeSeconds?: number;
}

export interface AppleLoginInput {
  identityToken: string;
  clientId: string;
  jwksUrl?: string;
  nonce?: string;
  name?: string;
  now?: Date;
}

interface TelegramUser {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface AppleClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  sub?: string;
  email?: string;
  nonce?: string;
}

interface JwksResponse {
  keys?: JsonWebKey[];
}

const TELEGRAM_DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export function verifyTelegramLogin(
  input: TelegramLoginInput,
  botToken: string,
): SocialProfile {
  const params = new URLSearchParams(input.initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) {
    throw new ValidationError('telegram_auth_invalid', 'Telegram auth hash is missing');
  }

  const dataCheckString = telegramDataCheckString(params);
  const expectedHash =
    input.source === 'login_widget'
      ? telegramLoginWidgetHash(dataCheckString, botToken)
      : telegramMiniAppHash(dataCheckString, botToken);

  if (!safeEqualHex(receivedHash, expectedHash)) {
    throw new ValidationError('telegram_auth_invalid', 'Telegram auth hash is invalid');
  }

  const authDate = Number(params.get('auth_date') ?? '0');
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const maxAge = input.maxAgeSeconds ?? TELEGRAM_DEFAULT_MAX_AGE_SECONDS;
  if (!Number.isFinite(authDate) || authDate <= 0 || nowSeconds - authDate > maxAge) {
    throw new ValidationError('telegram_auth_expired', 'Telegram auth data expired');
  }

  const user = telegramUserFromParams(params, input.source ?? 'mini_app');
  if (!user.id) {
    throw new ValidationError('telegram_auth_invalid', 'Telegram user id is missing');
  }

  return {
    provider: 'telegram',
    subject: String(user.id),
    displayName: displayName([
      user.first_name,
      user.last_name,
      user.username ? `@${user.username}` : undefined,
    ]),
    avatarUrl: user.photo_url,
  };
}

export async function verifyAppleIdentityToken(
  input: AppleLoginInput,
): Promise<SocialProfile> {
  const parts = input.identityToken.split('.');
  if (parts.length !== 3) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token is malformed');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtJson<JwtHeader>(encodedHeader);
  const claims = decodeJwtJson<AppleClaims>(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token header is invalid');
  }

  const jwk = await appleJwk(header.kid, input.jwksUrl ?? APPLE_JWKS_URL);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verified = verifyCrypto(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, 'base64url'),
  );
  if (!verified) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token signature is invalid');
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (claims.iss !== APPLE_ISSUER) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token issuer is invalid');
  }
  if (!audienceMatches(claims.aud, input.clientId)) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token audience is invalid');
  }
  if (!claims.exp || claims.exp <= nowSeconds) {
    throw new ValidationError('apple_token_expired', 'Apple identity token expired');
  }
  if (!claims.sub) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token subject is missing');
  }
  if (input.nonce && claims.nonce !== input.nonce) {
    throw new ValidationError('apple_token_invalid', 'Apple identity token nonce mismatch');
  }

  return {
    provider: 'apple',
    subject: claims.sub,
    email: claims.email,
    displayName: displayName([input.name, claims.email]),
  };
}

function telegramDataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function telegramMiniAppHash(dataCheckString: string, botToken: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

function telegramLoginWidgetHash(dataCheckString: string, botToken: string): string {
  const secret = createHash('sha256').update(botToken).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

function telegramUserFromParams(
  params: URLSearchParams,
  source: TelegramAuthSource,
): TelegramUser {
  if (source === 'login_widget') {
    return {
      id: params.get('id') ?? undefined,
      first_name: params.get('first_name') ?? undefined,
      last_name: params.get('last_name') ?? undefined,
      username: params.get('username') ?? undefined,
      photo_url: params.get('photo_url') ?? undefined,
    };
  }
  const rawUser = params.get('user');
  if (!rawUser) return {};
  try {
    return JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new ValidationError('telegram_auth_invalid', 'Telegram user payload is invalid');
  }
}

async function appleJwk(kid: string, jwksUrl: string): Promise<JsonWebKey> {
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new ValidationError('apple_jwks_unavailable', 'Apple JWKS is unavailable');
  }
  const jwks = (await response.json()) as JwksResponse;
  const key = jwks.keys?.find((candidate) => candidate.kid === kid);
  if (!key) {
    throw new ValidationError('apple_token_invalid', 'Apple signing key is unknown');
  }
  return key;
}

function decodeJwtJson<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new ValidationError('apple_token_invalid', 'Apple identity token is malformed');
  }
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function audienceMatches(audience: string | string[] | undefined, clientId: string): boolean {
  return Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
}

function displayName(values: Array<string | undefined>): string | undefined {
  const parts = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(' ') : undefined;
}
