import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

/**
 * App Store / Play review login (integration, real Postgres).
 *
 * Apple's reviewer cannot receive an SMS code, so a single pre-agreed phone
 * accepts a single fixed code — but ONLY when both AUTH_REVIEW_PHONE and
 * AUTH_REVIEW_OTP are configured. Absent either, the mechanism is completely
 * inert: no phone gets a bypass and the normal OTP path is unchanged. Scoped to
 * an exact phone+code match so it never widens ordinary login.
 */
describe('Auth: App Store review login (integration)', () => {
  let prisma: PrismaService;
  const reviewPhone = `+996700${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const otherPhone = `+996701${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const reviewOtp = '424242';

  function makeAuth(withReviewEnv: boolean) {
    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
    const values: Record<string, string> = withReviewEnv
      ? { AUTH_REVIEW_PHONE: reviewPhone, AUTH_REVIEW_OTP: reviewOtp }
      : {};
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    return new AuthService(prisma, jwt, config);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const phone of [reviewPhone, otherPhone]) {
      const customer = await prisma.customer.findUnique({ where: { phone } });
      if (!customer) continue;
      await prisma.refreshToken.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
    await prisma.$disconnect();
  });

  it('logs the reviewer in with the fixed code when configured — without a real challenge', async () => {
    const auth = makeAuth(true);
    const tokens = await auth.verifyOtp(reviewPhone, reviewOtp);
    expect(tokens.accessToken.split('.')).toHaveLength(3);

    const principal = await auth.verifyAccessToken(tokens.accessToken);
    const customer = await prisma.customer.findUnique({ where: { phone: reviewPhone } });
    expect(principal.customerId).toBe(customer?.id);
  });

  it('rejects a wrong code for the review phone (no bypass to any code)', async () => {
    const auth = makeAuth(true);
    await expect(auth.verifyOtp(reviewPhone, '000000')).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not let the fixed code work for any other phone', async () => {
    const auth = makeAuth(true);
    await expect(auth.verifyOtp(otherPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });

  it('is inert when the review env is not configured', async () => {
    const auth = makeAuth(false);
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);
  });
});
