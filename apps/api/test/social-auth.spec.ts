import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  createSign,
  generateKeyPairSync,
  KeyObject,
} from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

describe('Auth: social provider login', () => {
  const originalFetch = global.fetch;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    jwt = new JwtService({ secret: 'test-secret' });
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await prisma.$disconnect();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.customerIdentity.deleteMany();
    await prisma.customer.deleteMany({ where: { phone: { startsWith: '+999' } } });
  });

  it('verifies Telegram Mini App initData and links a stable customer identity', async () => {
    const botToken = '123456:telegram-secret';
    const auth = service({ TELEGRAM_BOT_TOKEN: botToken });
    const initData = signedTelegramInitData(botToken, {
      id: 777001,
      first_name: 'Ali',
      last_name: 'Buyer',
      username: 'ali_buyer',
    });

    const first = await auth.loginWithTelegram({ initData });
    const second = await auth.loginWithTelegram({ initData });

    expect(first.accessToken.split('.')).toHaveLength(3);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    const identities = await prisma.customerIdentity.findMany({
      where: { provider: 'telegram', subject: '777001' },
      include: { customer: true },
    });
    expect(identities).toHaveLength(1);
    expect(identities[0].displayName).toBe('Ali Buyer @ali_buyer');
    expect(identities[0].customer.segments).toContain('auth:telegram');
    expect(identities[0].customer.phone).toMatch(/^\+999\d{10}$/);
  });

  it('rejects tampered Telegram initData', async () => {
    const botToken = '123456:telegram-secret';
    const auth = service({ TELEGRAM_BOT_TOKEN: botToken });
    const initData = signedTelegramInitData(botToken, { id: 777002, first_name: 'Bad' })
      .replace('Bad', 'Mallory');

    const err = await auth.loginWithTelegram({ initData }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('telegram_auth_invalid');
  });

  it('verifies Apple identityToken through JWKS and links a customer identity', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const jwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'apple-key-1',
      alg: 'RS256',
      use: 'sig',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    }) as unknown as typeof fetch;

    const auth = service({
      APPLE_CLIENT_ID: 'kg.alistore.web',
      APPLE_JWKS_URL: 'https://apple.test/keys',
    });
    const token = signedJwt(
      { alg: 'RS256', kid: 'apple-key-1' },
      {
        iss: 'https://appleid.apple.com',
        aud: 'kg.alistore.web',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        sub: 'apple-sub-1',
        email: 'buyer@privaterelay.appleid.com',
        nonce: 'nonce-1',
      },
      privateKey,
    );

    const tokens = await auth.loginWithApple({
      identityToken: token,
      nonce: 'nonce-1',
      name: 'Apple Buyer',
    });

    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(global.fetch).toHaveBeenCalledWith('https://apple.test/keys');
    const identity = await prisma.customerIdentity.findUnique({
      where: {
        provider_subject: { provider: 'apple', subject: 'apple-sub-1' },
      },
      include: { customer: true },
    });
    expect(identity?.email).toBe('buyer@privaterelay.appleid.com');
    expect(identity?.displayName).toBe('Apple Buyer buyer@privaterelay.appleid.com');
    expect(identity?.customer.segments).toContain('auth:apple');
  });

  it('fails closed when a social provider is not configured', async () => {
    const auth = service({});
    const err = await auth
      .loginWithApple({ identityToken: 'header.payload.signature' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('social_provider_not_configured');
  });

  function service(values: Record<string, string>): AuthService {
    return new AuthService(prisma, jwt, {
      get: (key: string) => values[key],
    } as unknown as ConfigService);
  }
});

function signedTelegramInitData(
  botToken: string,
  user: Record<string, unknown>,
): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'test-query');
  params.set('user', JSON.stringify(user));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set(
    'hash',
    createHmac('sha256', secret).update(dataCheckString).digest('hex'),
  );
  return params.toString();
}

function signedJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: KeyObject,
): string {
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign('RSA-SHA256')
    .update(input)
    .sign(privateKey)
    .toString('base64url');
  return `${input}.${signature}`;
}

function base64urlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
