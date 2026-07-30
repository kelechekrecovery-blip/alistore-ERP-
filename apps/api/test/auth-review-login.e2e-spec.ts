import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

/**
 * App Store / Play review login (integration, real Postgres).
 *
 * Apple's reviewer cannot receive an SMS code, so a single pre-agreed phone
 * accepts a single fixed code — but ONLY when AUTH_REVIEW_PHONE,
 * AUTH_REVIEW_OTP and a short future AUTH_REVIEW_UNTIL are configured. Absent
 * any of them, the mechanism is completely inert. Scoped to an exact phone+code
 * match so it never widens ordinary login.
 */
describe('Auth: App Store review login (integration)', () => {
  let prisma: PrismaService;
  const reviewPhone = `+996700${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const otherPhone = `+996701${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const reviewOtp = '424242';

  function makeAuth(values: Record<string, string>) {
    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    return new AuthService(prisma, jwt, config);
  }

  function configured() {
    return {
      AUTH_REVIEW_PHONE: reviewPhone,
      AUTH_REVIEW_OTP: reviewOtp,
      AUTH_REVIEW_UNTIL: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.reviewLoginGuard.deleteMany({ where: { phone: reviewPhone } });
    for (const phone of [reviewPhone, otherPhone]) {
      const customer = await prisma.customer.findUnique({ where: { phone } });
      if (!customer) continue;
      await prisma.refreshToken.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedReviewAccount() {
    return prisma.customer.create({
      data: { phone: reviewPhone, name: 'Short-lived review account' },
    });
  }

  it('logs the reviewer in with the fixed code when configured — without a real challenge', async () => {
    await seedReviewAccount();
    const auth = makeAuth(configured());
    const tokens = await auth.verifyOtp(reviewPhone, reviewOtp);
    expect(tokens.accessToken.split('.')).toHaveLength(3);

    const principal = await auth.verifyAccessToken(tokens.accessToken);
    const customer = await prisma.customer.findUnique({ where: { phone: reviewPhone } });
    expect(principal.customerId).toBe(customer?.id);
    // The review login is a plain customer session — never a staff/admin scope.
    expect((principal as { role?: string }).role).toBeUndefined();
  });

  it('normalizes the configured review phone without widening the fixed-code match', async () => {
    await seedReviewAccount();
    const auth = makeAuth({
      AUTH_REVIEW_PHONE: reviewPhone.slice(1),
      AUTH_REVIEW_OTP: reviewOtp,
      AUTH_REVIEW_UNTIL: configured().AUTH_REVIEW_UNTIL,
    });
    const tokens = await auth.verifyOtp(reviewPhone, reviewOtp);
    expect(tokens.accessToken.split('.')).toHaveLength(3);
    await expect(auth.verifyOtp(otherPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a wrong code for the review phone (no bypass to any code)', async () => {
    await seedReviewAccount();
    const auth = makeAuth(configured());
    await expect(auth.verifyOtp(reviewPhone, '000000')).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not let the fixed code work for any other phone', async () => {
    const auth = makeAuth(configured());
    await expect(auth.verifyOtp(otherPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('is inert when the review env is not configured', async () => {
    const auth = makeAuth({});
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('is inert with only a partial env (phone without code, or code without phone)', async () => {
    await expect(makeAuth({ AUTH_REVIEW_PHONE: reviewPhone }).verifyOtp(reviewPhone, reviewOtp))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(makeAuth({ AUTH_REVIEW_OTP: reviewOtp }).verifyOtp(reviewPhone, reviewOtp))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('is inert without the mandatory expiry window', async () => {
    const auth = makeAuth({ AUTH_REVIEW_PHONE: reviewPhone, AUTH_REVIEW_OTP: reviewOtp });
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('is inert when the env values are whitespace only', async () => {
    const auth = makeAuth({ AUTH_REVIEW_PHONE: '   ', AUTH_REVIEW_OTP: '   ' });
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('honours AUTH_REVIEW_UNTIL — expired or unparseable window fails closed', async () => {
    const past = makeAuth({ ...configured(), AUTH_REVIEW_UNTIL: '2000-01-01T00:00:00.000Z' });
    await expect(past.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
    const bad = makeAuth({ ...configured(), AUTH_REVIEW_UNTIL: 'not-a-date' });
    await expect(bad.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('still works within a short future AUTH_REVIEW_UNTIL window', async () => {
    await seedReviewAccount();
    const auth = makeAuth(configured());
    const tokens = await auth.verifyOtp(reviewPhone, reviewOtp);
    expect(tokens.accessToken.split('.')).toHaveLength(3);
  });

  it('rejects an expiry window longer than seven days', async () => {
    const auth = makeAuth({
      ...configured(),
      AUTH_REVIEW_UNTIL: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('does NOT bypass the recovery path — recovery still requires a real challenge', async () => {
    const auth = makeAuth(configured());
    await expect(auth.verifyRecoveryOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('requires a pre-existing review account and never creates one through the bypass', async () => {
    const auth = makeAuth(configured());

    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
    await expect(prisma.customer.findUnique({ where: { phone: reviewPhone } })).resolves.toBeNull();
    await expect(prisma.auditEvent.findFirst({
      where: { type: 'auth.review_login_account_missing' },
      orderBy: { ts: 'desc' },
    })).resolves.toMatchObject({
      payload: expect.objectContaining({ outcome: 'account_missing', attempts: 1 }),
    });
  });

  it('shares one durable attempt budget across independent API instances and locks at five', async () => {
    await seedReviewAccount();
    const services = Array.from({ length: 5 }, () => makeAuth(configured()));

    for (const auth of services) {
      await expect(auth.verifyOtp(reviewPhone, '000000')).rejects.toBeInstanceOf(ValidationError);
    }

    await expect(prisma.reviewLoginGuard.findUniqueOrThrow({
      where: { phone: reviewPhone },
    })).resolves.toMatchObject({
      attempts: 5,
      lockedUntil: expect.any(Date),
      disabledAt: null,
    });
    await expect(makeAuth(configured()).verifyOtp(reviewPhone, reviewOtp))
      .rejects.toMatchObject({ code: 'review_login_locked' });
  });

  it('serializes concurrent distributed guesses without exceeding the global budget', async () => {
    await seedReviewAccount();
    const attempts = await Promise.allSettled(
      Array.from(
        { length: 20 },
        () => makeAuth(configured()).verifyOtp(reviewPhone, '000000'),
      ),
    );

    expect(attempts.every((attempt) => attempt.status === 'rejected')).toBe(true);
    await expect(prisma.reviewLoginGuard.findUniqueOrThrow({
      where: { phone: reviewPhone },
    })).resolves.toMatchObject({
      attempts: 5,
      lockedUntil: expect.any(Date),
    });
  });

  it('allows three review retries, then durably disables and audits the credential', async () => {
    const customer = await seedReviewAccount();
    const auth = makeAuth(configured());
    const startedAt = new Date();

    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).resolves.toHaveProperty('accessToken');
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).resolves.toHaveProperty('accessToken');
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).resolves.toHaveProperty('accessToken');
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);

    await expect(prisma.reviewLoginGuard.findUniqueOrThrow({
      where: { phone: reviewPhone },
    })).resolves.toMatchObject({
      attempts: 0,
      successes: 3,
      lockedUntil: null,
      disabledAt: expect.any(Date),
    });
    await expect(prisma.refreshToken.count({
      where: { customerId: customer.id, revokedAt: null },
    })).resolves.toBe(3);
    const events = await prisma.auditEvent.findMany({
      where: {
        type: { in: ['auth.review_login_success', 'auth.review_login_success_disabled'] },
        ts: { gte: startedAt },
      },
      orderBy: { ts: 'asc' },
    });
    expect(events.map((event) => event.type)).toEqual([
      'auth.review_login_success',
      'auth.review_login_success',
      'auth.review_login_success_disabled',
    ]);
  });
});
