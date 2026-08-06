import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

function captureSyncError(action: () => unknown): unknown {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * Phone+OTP login (integration, real Postgres). Numbers come from the +99679…
 * range, but that alone guarantees nothing: it is an ordinary Kyrgyz mobile
 * prefix, and other suites generate numbers inside it. Isolation comes from the
 * cleanup below, which touches only the numbers this suite handed out.
 */
describe('Auth: phone + OTP → JWT (integration)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let seq = 0;
  let ownPhones: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const jwt = new JwtService({
      secret: 'test-secret',
      signOptions: { expiresIn: '15m' },
    });
    const config = {
      get: (key: string) => ({
        AUTH_OTP_DEV_ECHO: 'true',
        AUTH_REFRESH_ROTATION_GRACE_ENABLED: 'true',
        AUTH_REFRESH_DERIVATION_SECRET: 'test-refresh-derivation-secret-32-bytes-minimum',
      }[key]),
    } as unknown as ConfigService;
    auth = new AuthService(prisma, jwt, config);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Чистим только собственные номера. `+99679` — префикс кыргызских мобильных, а
  // не метка фикстур этого сьюта: по нему чистка выносила покупателей других
  // сьютов и падала на `Order_customerId_fkey`, когда у них были заказы. Здесь
  // покупателя создаёт сам AuthService при входе, поэтому опорой служат номера,
  // которые выдал `nextPhone`, а не id из явного create.
  beforeEach(async () => {
    const own = await prisma.customer.findMany({
      where: { phone: { in: ownPhones } },
      select: { id: true },
    });
    await prisma.refreshToken.deleteMany({ where: { customerId: { in: own.map((c) => c.id) } } });
    await prisma.otpChallenge.deleteMany({ where: { phone: { in: ownPhones } } });
    await prisma.customer.deleteMany({ where: { phone: { in: ownPhones } } });
    ownPhones = [];
  });

  function nextPhone(): string {
    seq += 1;
    const phone = `+99679${seq.toString().padStart(7, '0')}`;
    ownPhones = [...ownPhones, phone];
    return phone;
  }

  it('requests then verifies an OTP, issuing access + refresh tokens', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    expect(devCode).toMatch(/^\d{6}$/);

    const tokens = await auth.verifyOtp(phone, devCode as string);
    expect(tokens.accessToken.split('.')).toHaveLength(3); // JWT header.payload.sig
    expect(tokens.refreshToken.length).toBeGreaterThan(20);
    expect(tokens.tokenType).toBe('Bearer');

    const customer = await prisma.customer.findUnique({ where: { phone } });
    expect(customer).not.toBeNull();
  });

  it('never echoes an OTP when production mode is misconfigured', async () => {
    const productionConfig = {
      get: (key: string) => ({ AUTH_OTP_DEV_ECHO: 'true', NODE_ENV: 'production' }[key]),
    } as unknown as ConfigService;
    const productionAuth = new AuthService(
      prisma,
      new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } }),
      productionConfig,
    );

    const result = await productionAuth.requestOtp(nextPhone());
    expect(result).toEqual({ challengeId: expect.any(String) });
    expect(result).not.toHaveProperty('devCode');
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const wrong = devCode === '000000' ? '111111' : '000000';

    const err = await auth.verifyOtp(phone, wrong).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('otp_invalid');

    const challenge = await prisma.otpChallenge.findFirst({ where: { phone } });
    expect(challenge?.attempts).toBe(1);
  });

  it('atomically caps 20 concurrent wrong guesses at five claims', async () => {
    const phone = nextPhone();
    const { challengeId, devCode } = await auth.requestOtp(phone);
    const wrong = devCode === '000000' ? '111111' : '000000';

    const guesses = await Promise.allSettled(
      Array.from({ length: 20 }, () => auth.verifyOtp(phone, wrong, challengeId)),
    );
    expect(guesses.every((guess) => guess.status === 'rejected')).toBe(true);

    const challenge = await prisma.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.attempts).toBe(5);
    expect(challenge.consumedAt).toBeNull();
  });

  it('lets exactly one of 20 concurrent correct verifies issue tokens', async () => {
    const phone = nextPhone();
    const { challengeId, devCode } = await auth.requestOtp(phone);

    const verifies = await Promise.allSettled(
      Array.from(
        { length: 20 },
        () => auth.verifyOtp(phone, devCode as string, challengeId),
      ),
    );
    expect(verifies.filter((verify) => verify.status === 'fulfilled')).toHaveLength(1);

    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await expect(prisma.refreshToken.count({
      where: { customerId: customer.id, revokedAt: null },
    })).resolves.toBe(1);
  });

  it('keeps login and recovery challenges purpose-bound', async () => {
    const phone = nextPhone();
    await prisma.customer.create({ data: { phone, name: 'Purpose Bound' } });
    const login = await auth.requestOtp(phone, 'login');
    const recovery = await auth.requestRecoveryOtp(phone);

    await expect(
      auth.verifyRecoveryOtp(phone, login.devCode as string, login.challengeId),
    ).rejects.toMatchObject({ code: 'otp_not_found' });
    await expect(
      auth.verifyOtp(phone, recovery.devCode as string, recovery.challengeId),
    ).rejects.toMatchObject({ code: 'otp_not_found' });

    await expect(
      prisma.otpChallenge.findUniqueOrThrow({ where: { id: login.challengeId } }),
    ).resolves.toMatchObject({ purpose: 'login', attempts: 0 });
    await expect(
      prisma.otpChallenge.findUniqueOrThrow({ where: { id: recovery.challengeId } }),
    ).resolves.toMatchObject({ purpose: 'recovery', attempts: 0 });
  });

  it('canonicalizes +996 and 996 forms to one challenge and customer identity', async () => {
    const phone = nextPhone();
    const withoutPlus = phone.slice(1);
    const first = await auth.requestOtp(withoutPlus);
    await auth.verifyOtp(phone, first.devCode as string, first.challengeId);

    const second = await auth.requestOtp(phone);
    await auth.verifyOtp(withoutPlus, second.devCode as string, second.challengeId);

    await expect(prisma.customer.count({ where: { phone } })).resolves.toBe(1);
    await expect(prisma.customer.count({ where: { phone: withoutPlus } })).resolves.toBe(0);
    await expect(
      prisma.otpChallenge.count({ where: { phone } }),
    ).resolves.toBe(2);
  });

  it('verifies a raw legacy no-plus challenge written by an old API revision', async () => {
    const phone = nextPhone();
    const withoutPlus = phone.slice(1);
    ownPhones = [...ownPhones, withoutPlus];
    const code = '654321';
    const challenge = await prisma.otpChallenge.create({
      data: {
        phone: withoutPlus,
        purpose: 'login',
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await expect(auth.verifyOtp(phone, code, challenge.id)).resolves.toHaveProperty('accessToken');
    await expect(prisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.id } }))
      .resolves.toMatchObject({ attempts: 1, consumedAt: expect.any(Date) });
    await expect(prisma.customer.findUnique({ where: { phone } })).resolves.not.toBeNull();
  });

  it('keeps production recovery disabled until the rollout flag is explicit', async () => {
    const phone = nextPhone();
    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
    const productionAuth = (enabled?: string) => new AuthService(
      prisma,
      jwt,
      {
        get: (key: string) => ({
          NODE_ENV: 'production',
          AUTH_RECOVERY_OTP_ENABLED: enabled,
        }[key]),
      } as unknown as ConfigService,
    );

    expect(captureSyncError(() => productionAuth().requestRecoveryOtp(phone))).toMatchObject({
      code: 'recovery_temporarily_unavailable',
    });
    expect(captureSyncError(() => productionAuth('false').requestRecoveryOtp(phone))).toMatchObject({
      code: 'recovery_temporarily_unavailable',
    });

    const enabled = await productionAuth('true').requestRecoveryOtp(phone);
    expect(enabled).toEqual({ challengeId: expect.any(String) });
    await expect(prisma.otpChallenge.findUniqueOrThrow({ where: { id: enabled.challengeId } }))
      .resolves.toMatchObject({ phone, purpose: 'recovery' });
  });

  it('adopts a legacy 996 customer into canonical storage without changing its id', async () => {
    const phone = nextPhone();
    const withoutPlus = phone.slice(1);
    ownPhones = [...ownPhones, withoutPlus];
    const legacy = await prisma.customer.create({
      data: { phone: withoutPlus, name: 'Existing legacy customer' },
    });
    const challenge = await auth.requestOtp(phone);

    const tokens = await auth.verifyOtp(phone, challenge.devCode as string, challenge.challengeId);
    const principal = await auth.verifyAccessToken(tokens.accessToken);

    expect(principal.customerId).toBe(legacy.id);
    await expect(prisma.customer.findUnique({ where: { id: legacy.id } }))
      .resolves.toMatchObject({ phone });
    await expect(prisma.customer.count({
      where: { phone: { in: [phone, withoutPlus] } },
    })).resolves.toBe(1);
  });

  it('rejects invalid phone identities before persistence or lookup', async () => {
    await expect(auth.requestOtp('not-a-phone')).rejects.toMatchObject({ code: 'phone_invalid' });
    await expect(auth.verifyOtp('+000000000', '123456')).rejects.toMatchObject({
      code: 'phone_invalid',
    });
  });

  it('supports challengeId pinning and legacy latest-challenge verification', async () => {
    const phone = nextPhone();
    const older = await auth.requestOtp(phone);
    const newer = await auth.requestOtp(phone);

    const pinned = await auth.verifyOtp(phone, older.devCode as string, older.challengeId);
    expect(pinned.accessToken.split('.')).toHaveLength(3);

    const legacy = await auth.verifyOtp(phone, newer.devCode as string);
    expect(legacy.accessToken.split('.')).toHaveLength(3);
  });

  it('allows an immediate concurrent-style replay without revoking the first replacement', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);

    const rotated = await auth.refresh(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    const concurrentRetry = await auth.refresh(first.refreshToken);
    expect(concurrentRetry.refreshToken).toBe(rotated.refreshToken);
    await expect(auth.refresh(rotated.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('serves concurrent refresh retries with one deterministic hashed replacement', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);

    const attempts = await Promise.allSettled([
      auth.refresh(first.refreshToken),
      auth.refresh(first.refreshToken),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(2);
    const replacements = attempts
      .filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof auth.refresh>>> =>
        attempt.status === 'fulfilled')
      .map((attempt) => attempt.value.refreshToken);
    expect(new Set(replacements).size).toBe(1);
    for (const attempt of attempts) {
      if (attempt.status === 'fulfilled') {
        expect(attempt.value.accessToken.split('.')).toHaveLength(3);
      }
    }

    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await expect(
      prisma.refreshToken.count({
        where: { customerId: customer.id, revokedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(auth.refresh(replacements[0])).resolves.toHaveProperty('accessToken');
  });

  it.each([undefined, 'false'])(
    'keeps production refresh replay strict when grace gate is %s',
    async (gate) => {
      const phone = nextPhone();
      const { devCode } = await auth.requestOtp(phone);
      const first = await auth.verifyOtp(phone, devCode as string);
      const strictAuth = new AuthService(
        prisma,
        new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } }),
        {
          get: (key: string) => ({
            NODE_ENV: 'production',
            AUTH_REFRESH_ROTATION_GRACE_ENABLED: gate,
            AUTH_REFRESH_DERIVATION_SECRET: 'present-but-disabled-refresh-secret-32-bytes',
          }[key]),
        } as unknown as ConfigService,
      );

      const replacement = await strictAuth.refresh(first.refreshToken);
      await expect(strictAuth.refresh(first.refreshToken)).rejects.toMatchObject({
        code: 'refresh_reused',
      });
      await expect(strictAuth.refresh(replacement.refreshToken)).rejects.toMatchObject({
        code: 'refresh_reused',
      });
    },
  );

  it('fails closed when grace is enabled without a dedicated derivation secret', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);
    const misconfiguredAuth = new AuthService(
      prisma,
      new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } }),
      {
        get: (key: string) => ({
          NODE_ENV: 'production',
          AUTH_REFRESH_ROTATION_GRACE_ENABLED: 'true',
        }[key]),
      } as unknown as ConfigService,
    );

    await expect(misconfiguredAuth.refresh(first.refreshToken)).rejects.toThrow(
      'AUTH_REFRESH_DERIVATION_SECRET',
    );
    await expect(auth.refresh(first.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('treats replay after the rotation grace as theft and revokes live replacements', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);
    const replacement = await auth.refresh(first.refreshToken);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await prisma.$executeRaw`
      UPDATE "RefreshToken"
      SET "rotatedAt" = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 minute'
      WHERE "customerId" = ${customer.id} AND "rotatedAt" IS NOT NULL
    `;

    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject({ code: 'refresh_reused' });
    await expect(auth.refresh(replacement.refreshToken)).rejects.toMatchObject({ code: 'refresh_reused' });
  });

  it('bridges a new parent to old-writer legacy children without revoking a new session', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const current = await auth.verifyOtp(phone, devCode as string);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const ancestor = `legacy-ancestor-${phone}`;
    const child = `legacy-child-${phone}`;
    const sibling = `legacy-sibling-${phone}`;
    await prisma.refreshToken.createMany({
      data: [
        {
          customerId: customer.id,
          familyId: 'a'.repeat(32),
          tokenHash: hash(ancestor),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(Date.now() - 60_000),
          rotatedAt: new Date(Date.now() - 60_000),
        },
        {
          customerId: customer.id,
          familyId: 'legacy:child-from-old-writer',
          tokenHash: hash(child),
          expiresAt: new Date(Date.now() + 60_000),
        },
        {
          customerId: customer.id,
          familyId: 'legacy:other-old-writer',
          tokenHash: hash(sibling),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(auth.refresh(ancestor)).rejects.toMatchObject({ code: 'refresh_reused' });
    const legacyRows = await prisma.refreshToken.findMany({
      where: { customerId: customer.id, familyId: { startsWith: 'legacy:' } },
    });
    expect(legacyRows.every((row) => row.revokedAt !== null)).toBe(true);
    await expect(auth.refresh(current.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('database blocks an old-binary broad replay update from revoking a new family', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const current = await auth.verifyOtp(phone, devCode as string);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await prisma.refreshToken.create({
      data: {
        customerId: customer.id,
        familyId: `legacy:replayed-${customer.id}`,
        tokenHash: createHash('sha256').update(`old-replay-${phone}`).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(Date.now() - 60_000),
      },
    });

    // This is the previous binary's exact replay statement. The compatibility
    // trigger must abort it once it touches a live exact-family row.
    await expect(prisma.refreshToken.updateMany({
      where: { customerId: customer.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })).rejects.toThrow();
    await expect(auth.refresh(current.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('prevents concurrent refresh and logout from leaving a live replacement', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);
    const firstReplacement = await auth.refresh(first.refreshToken);

    const [refreshAttempt] = await Promise.allSettled([
      auth.refresh(first.refreshToken),
      auth.logout(first.refreshToken),
    ]);
    if (refreshAttempt.status === 'fulfilled') {
      await expect(auth.refresh(refreshAttempt.value.refreshToken)).rejects.toMatchObject({
        code: 'refresh_reused',
      });
    }
    await expect(auth.refresh(firstReplacement.refreshToken)).rejects.toMatchObject({
      code: 'refresh_reused',
    });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await expect(prisma.refreshToken.count({
      where: { customerId: customer.id, revokedAt: null },
    })).resolves.toBe(0);
  });

  it('recovers access and revokes previous refresh sessions', async () => {
    const phone = nextPhone();
    await prisma.customer.create({ data: { phone, name: 'Recover Me' } });

    const loginOtp = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, loginOtp.devCode as string);

    const recoveryOtp = await auth.requestRecoveryOtp(phone);
    const recovered = await auth.verifyRecoveryOtp(phone, recoveryOtp.devCode as string);
    expect(recovered.refreshToken).not.toBe(first.refreshToken);

    const rotated = await auth.refresh(recovered.refreshToken);
    expect(rotated.accessToken.split('.')).toHaveLength(3);

    const oldRefresh = await auth.refresh(first.refreshToken).catch((e) => e);
    expect(oldRefresh).toBeInstanceOf(ValidationError);
    expect((oldRefresh as ValidationError).code).toBe('refresh_reused');
    // Replaying a stolen token from the pre-recovery family cannot log the
    // recovered user out again.
    await expect(auth.refresh(rotated.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('does not create an account during recovery verify', async () => {
    const phone = nextPhone();
    const recoveryOtp = await auth.requestRecoveryOtp(phone);
    const err = await auth.verifyRecoveryOtp(phone, recoveryOtp.devCode as string).catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('customer_not_found');
    await expect(prisma.customer.findUnique({ where: { phone } })).resolves.toBeNull();
    await expect(
      prisma.otpChallenge.findUniqueOrThrow({ where: { id: recoveryOtp.challengeId } }),
    ).resolves.toMatchObject({ purpose: 'recovery', attempts: 1, consumedAt: null });
  });

  it('makes concurrent recovery consume/revoke/replacement exactly-once', async () => {
    const phone = nextPhone();
    await prisma.customer.create({ data: { phone, name: 'Recover Once' } });
    const login = await auth.requestOtp(phone);
    const old = await auth.verifyOtp(phone, login.devCode as string, login.challengeId);
    const recovery = await auth.requestRecoveryOtp(phone);

    const verifies = await Promise.allSettled(
      Array.from(
        { length: 20 },
        () => auth.verifyRecoveryOtp(phone, recovery.devCode as string, recovery.challengeId),
      ),
    );
    expect(verifies.filter((verify) => verify.status === 'fulfilled')).toHaveLength(1);

    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await expect(prisma.refreshToken.count({
      where: { customerId: customer.id, revokedAt: null },
    })).resolves.toBe(1);
    await expect(auth.refresh(old.refreshToken)).rejects.toMatchObject({ code: 'refresh_reused' });
  });

  it('does not verify an expired OTP', async () => {
    const phone = nextPhone();
    const { challengeId } = await auth.requestOtp(phone);
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const err = await auth.verifyOtp(phone, '123456').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('otp_not_found');
  });

  it('locks an OTP challenge after five wrong attempts', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const wrong = devCode === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const err = await auth.verifyOtp(phone, wrong).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe('otp_invalid');
    }

    const locked = await auth.verifyOtp(phone, devCode as string).catch((e) => e);
    expect(locked).toBeInstanceOf(ValidationError);
    expect((locked as ValidationError).code).toBe('otp_locked');
  });
});
