import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  createHash,
  createSign,
  generateKeyPairSync,
  KeyObject,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

describe('Auth: social provider login', () => {
  const originalFetch = global.fetch;
  const appleOauthPrivateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const appleEncryptionKey = randomBytes(32).toString('base64');
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
    await prisma.appleOAuthGrant.deleteMany();
    await prisma.appleRevocationJob.deleteMany();
    await prisma.customerIdentity.deleteMany();
    await prisma.customer.deleteMany({
      where: {
        OR: [
          { phone: { startsWith: '+999' } },
          { name: { startsWith: 'social-first-test' } },
        ],
      },
    });
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
    mockAppleFlow(jwk, { 'apple-code-1': token });
    const auth = service(appleConfig({
      APPLE_CLIENT_ID: 'kg.alistore.web',
      APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      APPLE_REDIRECT_URI: 'https://ali.kg/login',
      APPLE_JWKS_URL: 'https://apple.test/keys',
    }));

    const tokens = await auth.loginWithApple({
      identityToken: token,
      nonce: 'nonce-1',
      authorizationCode: 'apple-code-1',
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

    const nativeIdentityToken = nativeToken('apple-native-1', 'kg.alistore.client');
    const webIdentityToken = nativeToken('apple-web-1', 'kg.alistore.web');
    mockAppleFlow(jwk, {
      'native-code': nativeIdentityToken,
      'web-code': webIdentityToken,
    });
    const auth = service(appleConfig({
      APPLE_CLIENT_ID: 'kg.alistore.web,kg.alistore.client',
      APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      APPLE_REDIRECT_URI: 'https://ali.kg/login',
      APPLE_JWKS_URL: 'https://apple.test/keys',
    }));

    const native = await auth.loginWithApple({
      identityToken: nativeIdentityToken,
      nonce: 'nonce-apple-native-1',
      authorizationCode: 'native-code',
    });
    expect(native.accessToken.split('.')).toHaveLength(3);

    const web = await auth.loginWithApple({
      identityToken: webIdentityToken,
      nonce: 'nonce-apple-web-1',
      authorizationCode: 'web-code',
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

  it('exchanges the Apple code against the signed audience and persists only an encrypted grant', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const appleSigningKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwk = {
      ...rsa.publicKey.export({ format: 'jwk' }),
      kid: 'apple-key-grant',
      alg: 'RS256',
      use: 'sig',
    };
    const identityToken = signedJwt(
      { alg: 'RS256', kid: 'apple-key-grant' },
      {
        iss: 'https://appleid.apple.com',
        aud: 'kg.alistore.client',
        exp: Math.floor(Date.now() / 1000) + 300,
        sub: 'apple-grant-1',
        nonce: 'nonce-apple-grant-1',
      },
      rsa.privateKey,
    );
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/auth/token')) {
        return {
          ok: true,
          json: async () => ({
            refresh_token: 'never-store-this-refresh-token',
            id_token: identityToken,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) } as Response;
    }) as unknown as typeof fetch;
    await linkedIdentity('apple', 'apple-grant-1', '+9990000000006');
    const auth = service({
      APPLE_CLIENT_ID: 'kg.alistore.web,kg.alistore.client',
      APPLE_JWKS_URL: 'https://apple.test/keys',
      APPLE_TEAM_ID: 'ZYU3F8W56P',
      APPLE_KEY_ID: 'ALISTORE01',
      APPLE_PRIVATE_KEY: appleSigningKey,
      APPLE_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
        primary: randomBytes(32).toString('base64'),
      }),
      APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'primary',
    });

    await expect(auth.loginWithAppleV2({
      identityToken,
      nonce: 'nonce-apple-grant-1',
      authorizationCode: 'never-store-this-authorization-code',
    })).resolves.toMatchObject({ status: 'authenticated' });

    const grant = await prisma.appleOAuthGrant.findFirstOrThrow({
      where: { clientId: 'kg.alistore.client', subject: 'apple-grant-1' },
    });
    expect(grant.customerId).toBeTruthy();
    expect(grant.refreshTokenEnvelope).toMatch(/^v1\.primary\./u);
    expect(JSON.stringify(grant)).not.toContain('never-store-this');
  });

  it('durably queues revocation when an Apple phone enrollment expires', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...rsa.publicKey.export({ format: 'jwk' }),
      kid: 'apple-key-abandoned',
      alg: 'RS256',
      use: 'sig',
    };
    const identityToken = signedJwt(
      { alg: 'RS256', kid: 'apple-key-abandoned' },
      {
        iss: 'https://appleid.apple.com',
        aud: 'kg.alistore.client',
        exp: Math.floor(Date.now() / 1000) + 300,
        sub: 'apple-abandoned-1',
        nonce: 'nonce-apple-abandoned-1',
      },
      rsa.privateKey,
    );
    mockAppleFlow(jwk, { 'abandoned-code': identityToken });
    const auth = service(appleConfig({
      APPLE_CLIENT_ID: 'kg.alistore.client',
      APPLE_JWKS_URL: 'https://apple.test/keys',
    }));

    await expect(auth.loginWithAppleV2({
      identityToken,
      nonce: 'nonce-apple-abandoned-1',
      authorizationCode: 'abandoned-code',
    })).resolves.toMatchObject({ status: 'enrollment_required' });
    const enrollment = await prisma.socialEnrollment.findFirstOrThrow({
      where: { provider: 'apple', subject: 'apple-abandoned-1' },
    });
    await prisma.socialEnrollment.update({
      where: { id: enrollment.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await (
      auth as unknown as { deleteExpiredSocialAssertions(now: Date): Promise<void> }
    ).deleteExpiredSocialAssertions(new Date());

    expect(await prisma.appleOAuthGrant.findFirst({
      where: { subject: 'apple-abandoned-1' },
    })).toBeNull();
    expect(await prisma.appleRevocationJob.findFirst({
      where: { subject: 'apple-abandoned-1' },
    })).toMatchObject({ status: 'pending' });
  });

  it('binds overlapping Apple enrollments to exact grant generations', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...rsa.publicKey.export({ format: 'jwk' }),
      kid: 'apple-key-generations',
      alg: 'RS256',
      use: 'sig',
    };
    const tokenFor = (nonce: string) => signedJwt(
      { alg: 'RS256', kid: 'apple-key-generations' },
      {
        iss: 'https://appleid.apple.com',
        aud: 'kg.alistore.client',
        exp: Math.floor(Date.now() / 1000) + 300,
        sub: 'apple-generations-1',
        nonce,
      },
      rsa.privateKey,
    );
    const firstToken = tokenFor('nonce-generation-1');
    const secondToken = tokenFor('nonce-generation-2');
    mockAppleFlow(jwk, { 'code-generation-1': firstToken, 'code-generation-2': secondToken });
    const auth = service(appleConfig({
      APPLE_CLIENT_ID: 'kg.alistore.client',
      APPLE_JWKS_URL: 'https://apple.test/keys',
    }));

    await auth.loginWithAppleV2({
      identityToken: firstToken,
      nonce: 'nonce-generation-1',
      authorizationCode: 'code-generation-1',
    });
    const firstEnrollment = await prisma.socialEnrollment.findFirstOrThrow({
      where: { assertionHash: createHash('sha256').update(firstToken).digest('hex') },
    });
    await auth.loginWithAppleV2({
      identityToken: secondToken,
      nonce: 'nonce-generation-2',
      authorizationCode: 'code-generation-2',
    });
    const secondEnrollment = await prisma.socialEnrollment.findFirstOrThrow({
      where: { assertionHash: createHash('sha256').update(secondToken).digest('hex') },
    });
    expect(secondEnrollment.appleGrantId).toBeTruthy();
    expect(secondEnrollment.appleGrantId).not.toBe(firstEnrollment.appleGrantId);
    expect(await prisma.appleRevocationJob.count({
      where: { subject: 'apple-generations-1' },
    })).toBe(1);

    await prisma.socialEnrollment.update({
      where: { id: firstEnrollment.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await (
      auth as unknown as { deleteExpiredSocialAssertions(now: Date): Promise<void> }
    ).deleteExpiredSocialAssertions(new Date());
    await expect(prisma.appleOAuthGrant.findUnique({
      where: { id: secondEnrollment.appleGrantId! },
    })).resolves.toMatchObject({ status: 'enrollment' });
  });

  it('fails closed when a social provider is not configured', async () => {
    const auth = service({});
    const err = await auth
      .loginWithApple({ identityToken: 'header.payload.signature', nonce: 'nonce' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('social_provider_not_configured');
  });

  it('atomically creates one phone-less customer and rejects replayed assertions', async () => {
    const auth = service({ AUTH_SOCIAL_FIRST_SIGNUP_ENABLED: 'true' });
    const profile = {
      provider: 'google' as const,
      subject: `social-first-concurrent-${Date.now()}`,
      email: 'same-address@example.test',
      displayName: 'social-first-test concurrent',
    };
    const assertion = `verified-google-assertion-${Date.now()}`;

    const outcomes = await Promise.allSettled([
      resolveSocial(auth, profile, assertion),
      resolveSocial(auth, profile, assertion),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'social_auth_replayed' } });
    const identities = await prisma.customerIdentity.findMany({
      where: { provider: 'google', subject: profile.subject },
      include: { customer: true },
    });
    expect(identities).toHaveLength(1);
    expect(identities[0].customer).toMatchObject({
      phone: null,
      phoneVerifiedAt: null,
      name: profile.displayName,
    });
    expect(await prisma.socialEnrollment.count({
      where: { assertionHash: createHash('sha256').update(assertion).digest('hex'), consumedAt: { not: null } },
    })).toBe(1);

    const authenticated = outcomes.find(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof resolveSocial>>> =>
        outcome.status === 'fulfilled',
    )!.value;
    expect(jwt.decode<{ phone?: string }>(authenticated.accessToken)?.phone).toBeUndefined();
  });

  it('never auto-links by verified provider email', async () => {
    const email = `shared-${Date.now()}@example.test`;
    const original = await prisma.customer.create({
      data: {
        phone: `+999${Date.now().toString().slice(-10)}`,
        phoneVerifiedAt: new Date(),
        email,
        emailVerifiedAt: new Date(),
        name: 'Existing email owner',
      },
    });
    const auth = service({ AUTH_SOCIAL_FIRST_SIGNUP_ENABLED: 'true' });
    const result = await resolveSocial(auth, {
      provider: 'google',
      subject: `no-email-link-${Date.now()}`,
      email,
      displayName: 'social-first-test distinct customer',
    }, `verified-assertion-${Date.now()}`);

    const claims = jwt.decode<{ sub: string }>(result.accessToken)!;
    expect(claims.sub).not.toBe(original.id);
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: claims.sub } }))
      .resolves.toMatchObject({ phone: null, email: null });
  });

  it('attaches an active Apple grant to the newly created customer', async () => {
    const auth = service({ AUTH_SOCIAL_FIRST_SIGNUP_ENABLED: 'true' });
    const subject = `social-first-apple-${Date.now()}`;
    const result = await resolveSocial(auth, {
      provider: 'apple',
      subject,
      displayName: 'social-first-test Apple',
    }, `verified-apple-assertion-${Date.now()}`, {
      clientId: 'kg.alistore.client',
      subject,
      refreshToken: 'only-in-memory',
      refreshTokenEnvelope: 'v1.test.encrypted',
    });
    const customerId = jwt.decode<{ sub: string }>(result.accessToken)!.sub;
    await expect(prisma.appleOAuthGrant.findFirstOrThrow({
      where: { clientId: 'kg.alistore.client', subject },
    })).resolves.toMatchObject({ customerId, status: 'active' });
  });

  it('attaches an unused canonical phone once and refreshes the phone claim', async () => {
    const auth = service({
      NODE_ENV: 'test',
      AUTH_OTP_DEV_ECHO: 'true',
      AUTH_SOCIAL_FIRST_SIGNUP_ENABLED: 'true',
    });
    const result = await resolveSocial(auth, {
      provider: 'google',
      subject: `phone-attach-${Date.now()}`,
      displayName: 'social-first-test phone attach',
    }, `verified-attach-assertion-${Date.now()}`);
    const customerId = jwt.decode<{ sub: string }>(result.accessToken)!.sub;
    const phone = `+999${(Date.now() + 11).toString().slice(-10)}`;
    const challenge = await auth.requestOtp(phone);
    expect(challenge.devCode).toMatch(/^\d{6}$/u);

    const refreshed = await auth.completePhoneAttach(
      customerId,
      phone,
      challenge.devCode!,
      challenge.challengeId,
    );
    expect(jwt.decode<{ phone?: string }>(refreshed.accessToken)?.phone).toBe(phone);
    await expect(prisma.customer.findUniqueOrThrow({ where: { id: customerId } }))
      .resolves.toMatchObject({ phone, phoneVerifiedAt: expect.any(Date) });
    await expect(prisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId } }))
      .resolves.toMatchObject({ consumedAt: expect.any(Date) });
  });

  it('returns phone_already_linked without consuming a valid attach challenge', async () => {
    const phone = `+999${(Date.now() + 22).toString().slice(-10)}`;
    await prisma.customer.create({
      data: { phone, phoneVerifiedAt: new Date(), name: 'Existing phone owner' },
    });
    const auth = service({
      NODE_ENV: 'test',
      AUTH_OTP_DEV_ECHO: 'true',
      AUTH_SOCIAL_FIRST_SIGNUP_ENABLED: 'true',
    });
    const result = await resolveSocial(auth, {
      provider: 'google',
      subject: `phone-collision-${Date.now()}`,
      displayName: 'social-first-test collision',
    }, `verified-collision-assertion-${Date.now()}`);
    const customerId = jwt.decode<{ sub: string }>(result.accessToken)!.sub;
    const challenge = await auth.requestOtp(phone);

    await expect(auth.completePhoneAttach(
      customerId,
      phone,
      challenge.devCode!,
      challenge.challengeId,
    )).rejects.toMatchObject({ code: 'phone_already_linked' });
    await expect(prisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId } }))
      .resolves.toMatchObject({ consumedAt: null });
  });

  function service(values: Record<string, string>): AuthService {
    return new AuthService(prisma, jwt, {
      get: (key: string) => values[key],
    } as unknown as ConfigService);
  }

  function appleConfig(values: Record<string, string>): Record<string, string> {
    return {
      APPLE_TEAM_ID: 'ZYU3F8W56P',
      APPLE_KEY_ID: 'ALISTORE01',
      APPLE_PRIVATE_KEY: appleOauthPrivateKey,
      APPLE_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({ primary: appleEncryptionKey }),
      APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'primary',
      ...values,
    };
  }

  function mockAppleFlow(
    jwk: Record<string, unknown>,
    identityTokensByCode: Record<string, string>,
  ): void {
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/auth/token')) {
        const code = (init?.body as URLSearchParams).get('code') ?? '';
        return {
          ok: true,
          json: async () => ({
            refresh_token: `refresh-for-${code}`,
            id_token: identityTokensByCode[code],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) } as Response;
    }) as unknown as typeof fetch;
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

function resolveSocial(
  auth: AuthService,
  profile: {
    provider: 'apple' | 'google';
    subject: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
  },
  assertion: string,
  grant?: {
    clientId: string;
    subject: string;
    refreshToken: string;
    refreshTokenEnvelope: string;
  },
) {
  return (auth as unknown as {
    resolveSocialV2(
      socialProfile: typeof profile,
      providerAssertion: string,
      appleGrant?: typeof grant,
    ): Promise<{ status: 'authenticated'; accessToken: string }>;
  }).resolveSocialV2(profile, assertion, grant);
}

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
