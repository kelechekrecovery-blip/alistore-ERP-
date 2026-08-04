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
    await prisma.socialEnrollment.deleteMany();
    await prisma.customerIdentity.deleteMany();
    await prisma.customer.deleteMany({ where: { phone: { startsWith: '+999' } } });
  });

  it('verifies Telegram Mini App initData and signs in a linked identity', async () => {
    const botToken = '123456:telegram-secret';
    const auth = service({ TELEGRAM_BOT_TOKEN: botToken });
    await linkedIdentity('telegram', '777001', '+9990000000001');
    const initData = signedTelegramInitData(botToken, {
      id: 777001,
      first_name: 'Ali',
      last_name: 'Buyer',
      username: 'ali_buyer',
    });

    const first = await auth.loginWithTelegram({ initData });

    expect(first.accessToken.split('.')).toHaveLength(3);
    await expect(auth.loginWithTelegram({ initData })).rejects.toMatchObject({
      code: 'social_auth_replayed',
    });
    const identities = await prisma.customerIdentity.findMany({
      where: { provider: 'telegram', subject: '777001' },
      include: { customer: true },
    });
    expect(identities).toHaveLength(1);
    expect(identities[0].displayName).toBe('Ali Buyer @ali_buyer');
    expect(identities[0].customer.segments).toContain('auth:telegram');
    expect(identities[0].customer.phone).toMatch(/^\+999\d{10}$/);
  });

  it('rejects reordered and percent-equivalent replays on the legacy Telegram path', async () => {
    const botToken = '123456:telegram-secret';
    const auth = service({ TELEGRAM_BOT_TOKEN: botToken });
    await linkedIdentity('telegram', '777003', '+9990000000005');
    const captured = signedTelegramInitData(botToken, {
      id: 777003,
      first_name: 'Replay',
    });

    await expect(auth.loginWithTelegram({ initData: captured })).resolves.toHaveProperty(
      'accessToken',
    );
    await expect(auth.loginWithTelegram({
      initData: reorderedQuery(captured),
    })).rejects.toMatchObject({ code: 'social_auth_replayed' });
    await expect(auth.loginWithTelegram({
      initData: equivalentPercentEncoding(captured),
    })).rejects.toMatchObject({ code: 'social_auth_replayed' });
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

  it('requires nonce on the legacy Apple endpoint too', async () => {
    const auth = service({ APPLE_CLIENT_ID: 'kg.alistore.web' });

    await expect(auth.loginWithApple({
      identityToken: 'stolen-or-replayed-token',
    })).rejects.toMatchObject({ code: 'apple_nonce_required' });
  });

  it('verifies Apple identityToken through JWKS and signs in a linked identity', async () => {
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
    await linkedIdentity('apple', 'apple-sub-1', '+9990000000002');
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

  it('принимает и веб-Services ID, и bundle id нативного приложения', async () => {
    // У нативного Sign in with Apple в `aud` лежит bundle id приложения, а у
    // веб-потока — Services ID. Пока сверка шла с одним значением, включение
    // кнопки в iOS ломало вход на проде: `apple_token_invalid` с формулировкой
    // про audience, и только после того, как владелец настроит переменную.
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'apple-key-2',
      alg: 'RS256',
      use: 'sig',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    }) as unknown as typeof fetch;

    const auth = service({
      APPLE_CLIENT_ID: 'kg.alistore.web,kg.alistore.client',
      APPLE_JWKS_URL: 'https://apple.test/keys',
    });
    await linkedIdentity('apple', 'apple-native-1', '+9990000000003');
    await linkedIdentity('apple', 'apple-web-1', '+9990000000004');

    const nativeToken = (subject: string, audience: string) =>
      signedJwt(
        { alg: 'RS256', kid: 'apple-key-2' },
        {
          iss: 'https://appleid.apple.com',
          aud: audience,
          exp: Math.floor(Date.now() / 1000) + 300,
          iat: Math.floor(Date.now() / 1000),
          sub: subject,
          email: `${subject}@privaterelay.appleid.com`,
          nonce: `nonce-${subject}`,
        },
        privateKey,
      );

    const native = await auth.loginWithApple({
      identityToken: nativeToken('apple-native-1', 'kg.alistore.client'),
      nonce: 'nonce-apple-native-1',
    });
    expect(native.accessToken.split('.')).toHaveLength(3);

    const web = await auth.loginWithApple({
      identityToken: nativeToken('apple-web-1', 'kg.alistore.web'),
      nonce: 'nonce-apple-web-1',
    });
    expect(web.accessToken.split('.')).toHaveLength(3);

    // Чужая аудитория по-прежнему отвергается — список не должен превратиться
    // в «принимаем что угодно».
    const foreign = await auth
      .loginWithApple({
        identityToken: nativeToken('apple-foreign-1', 'kg.someone.else'),
        nonce: 'nonce-apple-foreign-1',
      })
      .catch((error) => error);
    expect(foreign).toBeInstanceOf(ValidationError);
    expect((foreign as ValidationError).code).toBe('apple_token_invalid');
  });

  it('fails closed when a social provider is not configured', async () => {
    const auth = service({});
    const err = await auth
      .loginWithApple({ identityToken: 'header.payload.signature', nonce: 'nonce' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('social_provider_not_configured');
  });

  function service(values: Record<string, string>): AuthService {
    return new AuthService(prisma, jwt, {
      get: (key: string) => values[key],
    } as unknown as ConfigService);
  }

  async function linkedIdentity(
    provider: string,
    subject: string,
    phone: string,
  ): Promise<void> {
    await prisma.customer.create({
      data: {
        phone,
        name: '',
        segments: [`auth:${provider}`],
        identities: { create: { provider, subject } },
      },
    });
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

function reorderedQuery(value: string): string {
  return value.split('&').reverse().join('&');
}

function equivalentPercentEncoding(value: string): string {
  return value.replace(/%[0-9A-F]{2}/g, (encoded) => encoded.toLowerCase());
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
