import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

/**
 * Phone+OTP login (integration, real Postgres). Uses the +99679… phone prefix so
 * it never collides with other integration suites' customers.
 */
describe('Auth: phone + OTP → JWT (integration)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const jwt = new JwtService({
      secret: 'test-secret',
      signOptions: { expiresIn: '15m' },
    });
    const config = {
      get: (key: string) => (key === 'AUTH_OTP_DEV_ECHO' ? 'true' : undefined),
    } as unknown as ConfigService;
    auth = new AuthService(prisma, jwt, config);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.otpChallenge.deleteMany({
      where: { phone: { startsWith: '+99679' } },
    });
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+99679' } },
    });
  });

  function nextPhone(): string {
    seq += 1;
    return `+99679${seq.toString().padStart(7, '0')}`;
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

  it('detects refresh-token reuse and revokes the replacement session', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);

    const rotated = await auth.refresh(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    const reused = await auth.refresh(first.refreshToken).catch((e) => e);
    expect(reused).toBeInstanceOf(ValidationError);
    expect((reused as ValidationError).code).toBe('refresh_reused');

    const replacement = await auth.refresh(rotated.refreshToken).catch((e) => e);
    expect(replacement).toBeInstanceOf(ValidationError);
    expect((replacement as ValidationError).code).toBe('refresh_reused');
  });

  it('serializes concurrent refresh retries and leaves no live stolen session', async () => {
    const phone = nextPhone();
    const { devCode } = await auth.requestOtp(phone);
    const first = await auth.verifyOtp(phone, devCode as string);

    const attempts = await Promise.allSettled([
      auth.refresh(first.refreshToken),
      auth.refresh(first.refreshToken),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);

    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await expect(
      prisma.refreshToken.count({
        where: { customerId: customer.id, revokedAt: null },
      }),
    ).resolves.toBe(0);
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
  });

  it('does not create an account during recovery verify', async () => {
    const phone = nextPhone();
    const recoveryOtp = await auth.requestRecoveryOtp(phone);
    const err = await auth.verifyRecoveryOtp(phone, recoveryOtp.devCode as string).catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('customer_not_found');
    await expect(prisma.customer.findUnique({ where: { phone } })).resolves.toBeNull();
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
