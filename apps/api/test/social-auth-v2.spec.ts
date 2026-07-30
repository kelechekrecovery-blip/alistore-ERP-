import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth: social enrollment v2', () => {
  const botToken = '123456:telegram-secret';
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    auth = new AuthService(
      prisma,
      new JwtService({ secret: 'test-secret' }),
      {
        get: (key: string) =>
          ({
            TELEGRAM_BOT_TOKEN: botToken,
            TELEGRAM_AUTH_MAX_AGE_SECONDS: '600',
            AUTH_OTP_DEV_ECHO: 'true',
            NODE_ENV: 'test',
          })[key],
      } as unknown as ConfigService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.socialEnrollment.deleteMany();
    await prisma.customerIdentity.deleteMany({
      where: { subject: { startsWith: 'v2-' } },
    });
    await prisma.otpChallenge.deleteMany({
      where: { phone: { startsWith: '+9967002' } },
    });
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+9967002' } },
    });
  });

  it('returns only an opaque enrollment token for an unknown verified identity', async () => {
    const beforeCustomers = await prisma.customer.count();
    const beforeTokens = await prisma.refreshToken.count();
    const result = await auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-new-1'),
    });
    if (result.status !== 'enrollment_required') throw new Error('expected enrollment');

    expect(result).toMatchObject({
      status: 'enrollment_required',
      expiresIn: 600,
    });
    expect(result).toHaveProperty('enrollmentToken');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(await prisma.customer.count()).toBe(beforeCustomers);
    expect(await prisma.customerIdentity.findUnique({
      where: { provider_subject: { provider: 'telegram', subject: 'v2-new-1' } },
    })).toBeNull();
    expect(await prisma.refreshToken.count()).toBe(beforeTokens);

    const persisted = await prisma.socialEnrollment.findFirst({
      where: { provider: 'telegram', subject: 'v2-new-1' },
    });
    expect(persisted?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(result.enrollmentToken);
    expect(JSON.stringify(persisted)).not.toContain('123456:telegram-secret');
  });

  it('links an existing canonical-phone customer and issues one session', async () => {
    const phone = '+996700200001';
    const existing = await prisma.customer.create({
      data: { phone, name: 'Existing phone owner' },
    });
    const enrollment = await auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-link-existing'),
    });
    if (enrollment.status !== 'enrollment_required') throw new Error('expected enrollment');
    const challenge = await auth.requestOtp(phone);

    const result = await auth.completeSocialEnrollment({
      enrollmentToken: enrollment.enrollmentToken,
      phone: '996700200001',
      code: challenge.devCode!,
      challengeId: challenge.challengeId,
    });

    expect(result.status).toBe('authenticated');
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(await prisma.customer.count({ where: { phone } })).toBe(1);
    expect(await prisma.customerIdentity.findUnique({
      where: {
        provider_subject: { provider: 'telegram', subject: 'v2-link-existing' },
      },
    })).toMatchObject({ customerId: existing.id });
  });

  it('fails closed on concurrent completion and consumes exactly one challenge/session', async () => {
    const phone = '+996700200002';
    const enrollment = await auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-race'),
    });
    if (enrollment.status !== 'enrollment_required') throw new Error('expected enrollment');
    const challenge = await auth.requestOtp(phone);
    const input = {
      enrollmentToken: enrollment.enrollmentToken,
      phone,
      code: challenge.devCode!,
      challengeId: challenge.challengeId,
    };

    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () => auth.completeSocialEnrollment(input)),
    );

    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.customer.count({ where: { phone } })).toBe(1);
    expect(await prisma.customerIdentity.count({
      where: { provider: 'telegram', subject: 'v2-race' },
    })).toBe(1);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    expect(await prisma.refreshToken.count({ where: { customerId: customer.id } })).toBe(1);
  });

  it('retains a consumed assertion replay marker beyond the ten-minute enrollment TTL', async () => {
    const phone = '+996700200008';
    const initData = signedTelegramInitData(botToken, 'v2-retained-replay');
    const enrollment = await auth.loginWithTelegramV2({ initData });
    if (enrollment.status !== 'enrollment_required') throw new Error('expected enrollment');
    const challenge = await auth.requestOtp(phone);
    const consumedAt = new Date();

    await auth.completeSocialEnrollment({
      enrollmentToken: enrollment.enrollmentToken,
      phone,
      code: challenge.devCode!,
      challengeId: challenge.challengeId,
    });
    const persisted = await prisma.socialEnrollment.findFirstOrThrow({
      where: { provider: 'telegram', subject: 'v2-retained-replay' },
    });
    expect(persisted.consumedAt).toBeInstanceOf(Date);
    expect(persisted.expiresAt.getTime())
      .toBeGreaterThanOrEqual(consumedAt.getTime() + 23 * 60 * 60 * 1000);

    // Drive cleanup with an explicit clock eleven minutes later. The short
    // enrollment ticket is over, but the assertion fingerprint must remain.
    await (
      auth as unknown as { deleteExpiredSocialAssertions(now: Date): Promise<void> }
    ).deleteExpiredSocialAssertions(new Date(consumedAt.getTime() + 11 * 60 * 1000));
    await expect(prisma.socialEnrollment.findUnique({
      where: { id: persisted.id },
    })).resolves.not.toBeNull();
    await expect(auth.loginWithTelegramV2({ initData })).rejects.toMatchObject({
      code: 'social_auth_replayed',
    });
  });

  it('preserves a replay marker extended while expired cleanup waits on its row lock', async () => {
    const capturedNow = new Date();
    const marker = await prisma.socialEnrollment.create({
      data: {
        tokenHash: createHash('sha256').update('cleanup-race-token').digest('hex'),
        assertionHash: createHash('sha256').update('cleanup-race-assertion').digest('hex'),
        provider: 'telegram',
        subject: 'v2-cleanup-race',
        expiresAt: new Date(capturedNow.getTime() - 60_000),
      },
    });
    let cleanupPromise: Promise<void> | undefined;
    let observedBlockedDelete = false;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "SocialEnrollment"
        WHERE id = ${marker.id}
        FOR UPDATE
      `;
      cleanupPromise = (
        auth as unknown as { deleteExpiredSocialAssertions(now: Date): Promise<void> }
      ).deleteExpiredSocialAssertions(capturedNow);

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [activity] = await tx.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND query LIKE '%DELETE FROM "SocialEnrollment"%'
              AND "wait_event_type" = 'Lock'
          ) AS blocked
        `;
        if (activity?.blocked) {
          observedBlockedDelete = true;
          break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }

      await tx.socialEnrollment.update({
        where: { id: marker.id },
        data: {
          consumedAt: capturedNow,
          expiresAt: new Date(capturedNow.getTime() + 24 * 60 * 60 * 1000),
        },
      });
    }, { timeout: 10_000 });

    expect(observedBlockedDelete).toBe(true);
    await cleanupPromise;
    await expect(prisma.socialEnrollment.findUnique({
      where: { id: marker.id },
    })).resolves.toMatchObject({
      consumedAt: capturedNow,
    });
  });

  it('rejects a tampered enrollment token without consuming the phone challenge', async () => {
    const phone = '+996700200003';
    const enrollment = await auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-tamper'),
    });
    if (enrollment.status !== 'enrollment_required') throw new Error('expected enrollment');
    const challenge = await auth.requestOtp(phone);

    await expect(auth.completeSocialEnrollment({
      enrollmentToken: `${enrollment.enrollmentToken}x`,
      phone,
      code: challenge.devCode!,
      challengeId: challenge.challengeId,
    })).rejects.toMatchObject({ code: 'social_enrollment_invalid' });

    await expect(auth.completeSocialEnrollment({
      enrollmentToken: enrollment.enrollmentToken,
      phone,
      code: challenge.devCode!,
      challengeId: challenge.challengeId,
    })).resolves.toMatchObject({ status: 'authenticated' });
  });

  it('persists failed-code attempts while leaving enrollment unconsumed', async () => {
    const phone = '+996700200007';
    const enrollment = await auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-wrong-code'),
    });
    if (enrollment.status !== 'enrollment_required') throw new Error('expected enrollment');
    const challenge = await auth.requestOtp(phone);

    await expect(auth.completeSocialEnrollment({
      enrollmentToken: enrollment.enrollmentToken,
      phone,
      code: '000000' === challenge.devCode ? '000001' : '000000',
      challengeId: challenge.challengeId,
    })).rejects.toMatchObject({ code: 'otp_invalid' });

    expect(await prisma.otpChallenge.findUnique({
      where: { id: challenge.challengeId },
    })).toMatchObject({ attempts: 1, consumedAt: null });
    expect(await prisma.socialEnrollment.findFirst({
      where: { provider: 'telegram', subject: 'v2-wrong-code' },
    })).toMatchObject({ consumedAt: null });
  });

  it('does not merge accounts by provider email', async () => {
    const phone = '+996700200004';
    const owner = await prisma.customer.create({
      data: {
        phone,
        name: 'Email owner',
        email: 'same@example.test',
        emailVerifiedAt: new Date(),
      },
    });
    const enrollment = await prisma.socialEnrollment.create({
      data: {
        tokenHash: createHash('sha256').update('email-enrollment').digest('hex'),
        assertionHash: createHash('sha256').update('email-assertion').digest('hex'),
        provider: 'apple',
        subject: 'v2-email-no-merge',
        email: 'same@example.test',
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const otherPhone = '+996700200005';
    const challenge = await auth.requestOtp(otherPhone);

    const result = await auth.completeSocialEnrollment({
      enrollmentToken: 'email-enrollment',
      phone: otherPhone,
      code: challenge.devCode!,
      challengeId: challenge.challengeId,
    });

    expect(result.status).toBe('authenticated');
    const identity = await prisma.customerIdentity.findUniqueOrThrow({
      where: { provider_subject: { provider: 'apple', subject: enrollment.subject } },
    });
    expect(identity.customerId).not.toBe(owner.id);
  });

  it('keeps v1 compatible for linked identities and rejects unknown identities', async () => {
    const customer = await prisma.customer.create({
      data: { phone: '+996700200006', name: 'Linked' },
    });
    await prisma.customerIdentity.create({
      data: {
        customerId: customer.id,
        provider: 'telegram',
        subject: 'v2-known',
      },
    });

    await expect(auth.loginWithTelegram({
      initData: signedTelegramInitData(botToken, 'v2-known'),
    })).resolves.toHaveProperty('accessToken');
    await expect(auth.loginWithTelegram({
      initData: signedTelegramInitData(botToken, 'v2-v1-unknown'),
    })).rejects.toMatchObject({ code: 'social_enrollment_required' });
  });

  it('rejects stale and replayed Telegram enrollment assertions', async () => {
    await expect(auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-stale', -601),
    })).rejects.toMatchObject({ code: 'telegram_auth_expired' });
    await expect(auth.loginWithTelegramV2({
      initData: signedTelegramInitData(botToken, 'v2-future', 31),
    })).rejects.toMatchObject({ code: 'telegram_auth_expired' });

    const initData = signedTelegramInitData(botToken, 'v2-replay');
    await expect(auth.loginWithTelegramV2({ initData })).resolves.toMatchObject({
      status: 'enrollment_required',
    });
    await expect(auth.loginWithTelegramV2({ initData })).rejects.toMatchObject({
      code: 'social_auth_replayed',
    });
  });

  it('rejects reordered and percent-equivalent replays on the V2 enrollment path', async () => {
    const captured = signedTelegramInitData(botToken, 'v2-canonical-replay');

    await expect(auth.loginWithTelegramV2({ initData: captured })).resolves.toMatchObject({
      status: 'enrollment_required',
    });
    await expect(auth.loginWithTelegramV2({
      initData: reorderedQuery(captured),
    })).rejects.toMatchObject({ code: 'social_auth_replayed' });
    await expect(auth.loginWithTelegramV2({
      initData: equivalentPercentEncoding(captured),
    })).rejects.toMatchObject({ code: 'social_auth_replayed' });
  });

  it('prunes expired assertion records before reserving a fresh login', async () => {
    const initData = signedTelegramInitData(botToken, 'v2-expired-ledger');
    await expect(auth.loginWithTelegramV2({ initData })).resolves.toMatchObject({
      status: 'enrollment_required',
    });
    await prisma.socialEnrollment.updateMany({
      where: { subject: 'v2-expired-ledger' },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(auth.loginWithTelegramV2({ initData })).resolves.toMatchObject({
      status: 'enrollment_required',
    });
    expect(await prisma.socialEnrollment.count({
      where: { subject: 'v2-expired-ledger' },
    })).toBe(1);
  });

  it('requires an Apple nonce before provider verification on v2', async () => {
    await expect(auth.loginWithAppleV2({
      identityToken: 'header.payload.signature',
    })).rejects.toMatchObject({ code: 'apple_nonce_required' });
  });
});

function signedTelegramInitData(
  botToken: string,
  subject: string,
  ageSeconds = 0,
): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000) + ageSeconds));
  params.set('query_id', `query-${subject}`);
  params.set('user', JSON.stringify({ id: subject, first_name: 'V2' }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

function reorderedQuery(value: string): string {
  return value.split('&').reverse().join('&');
}

function equivalentPercentEncoding(value: string): string {
  return value.replace(/%[0-9A-F]{2}/g, (encoded) => encoded.toLowerCase());
}
