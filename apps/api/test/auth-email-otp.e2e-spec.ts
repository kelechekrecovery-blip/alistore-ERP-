import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';

/**
 * Email + OTP login (integration, real Postgres).
 *
 * Email — второй канал входа в тот же аккаунт, а не вторая личность: телефон
 * остаётся первичным идентификатором (доставка и COD без него не работают).
 * Поэтому вход по email доступен аккаунту, к которому email привязан, а
 * привязать его можно только подтвердив код, присланный на этот адрес.
 *
 * Адреса берём в домене `@emailotp.test`, чтобы не пересекаться с фикстурами
 * других интеграционных сьютов на общей базе.
 */
describe('Auth: email + OTP → JWT (integration)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let seq = 0;
  let phoneSeq = 0;

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
      where: { email: { endsWith: '@emailotp.test' } },
    });
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+99678' } },
    });
  });

  function nextEmail(): string {
    seq += 1;
    return `owner${seq.toString().padStart(4, '0')}@emailotp.test`;
  }

  function nextPhone(): string {
    phoneSeq += 1;
    return `+99678${phoneSeq.toString().padStart(7, '0')}`;
  }

  async function seedCustomerWithEmail(email: string) {
    return prisma.customer.create({
      data: { phone: nextPhone(), name: 'Тест', email },
    });
  }

  it('logs an existing customer in by their attached email', async () => {
    const email = nextEmail();
    const customer = await seedCustomerWithEmail(email);

    const { devCode } = await auth.requestEmailOtp(email);
    expect(devCode).toMatch(/^\d{6}$/);

    const tokens = await auth.verifyEmailOtp(email, devCode as string);
    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(tokens.tokenType).toBe('Bearer');

    const principal = await auth.verifyAccessToken(tokens.accessToken);
    expect(principal.customerId).toBe(customer.id);
  });

  it('normalizes case and surrounding whitespace so one address is one identity', async () => {
    const email = nextEmail();
    const customer = await seedCustomerWithEmail(email);

    const { devCode } = await auth.requestEmailOtp(`  ${email.toUpperCase()}  `);
    const tokens = await auth.verifyEmailOtp(email, devCode as string);

    const principal = await auth.verifyAccessToken(tokens.accessToken);
    expect(principal.customerId).toBe(customer.id);
  });

  it('does not reveal whether an address has an account', async () => {
    const unknown = nextEmail();

    // Запрос выглядит одинаково для существующего и несуществующего адреса —
    // иначе эндпоинт становится оракулом «есть ли у вас аккаунт».
    const issued = await auth.requestEmailOtp(unknown);
    expect(issued.challengeId).toEqual(expect.any(String));
    // Кода нет и письмо не уходит — но строка создаётся намеренно, чтобы работа
    // и форма ответа не отличались от ветки известного адреса. Прежний вариант
    // «не создавать строку» и выдавал отличие: короткий синтетический id.
    expect(issued.devCode).toBeUndefined();
  });

  it('выдаёт неотличимый challengeId и для известного, и для неизвестного адреса', async () => {
    const known = nextEmail();
    await seedCustomerWithEmail(known);
    const unknown = nextEmail();

    const a = await auth.requestEmailOtp(known);
    const b = await auth.requestEmailOtp(unknown);

    // Синтетический id из randomBytes(16).toString('base64url') — это 22 символа
    // из [A-Za-z0-9_-], а cuid из базы — 25 символов [a-z0-9], всегда с 'c'.
    // Одного запроса хватало, чтобы по длине классифицировать адрес: «этот
    // человек — клиент AliStore». Никакая статистика не нужна.
    expect(b.challengeId.length).toBe(a.challengeId.length);
    expect(b.challengeId).toMatch(/^[a-z0-9]+$/);
  });

  it('не пускает больше пяти попыток даже при одновременных запросах', async () => {
    const email = nextEmail();
    await seedCustomerWithEmail(email);
    const { challengeId } = await auth.requestEmailOtp(email);

    // Счётчик читался, проверялся и увеличивался тремя отдельными запросами без
    // блокировки: десять параллельных попыток все видели attempts = 0 и все
    // проходили проверку лимита. Бюджет перебора был не 5, а сколько пропустит
    // throttle.
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => auth.verifyEmailOtp(email, '000000')),
    );
    expect(attempts.every((r) => r.status === 'rejected')).toBe(true);

    const challenge = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    expect(challenge?.attempts).toBeLessThanOrEqual(5);
  });

  it('расходует правильный код ровно один раз при гонке', async () => {
    const email = nextEmail();
    await seedCustomerWithEmail(email);
    const { devCode } = await auth.requestEmailOtp(email);

    const races = await Promise.allSettled(
      Array.from({ length: 4 }, () => auth.verifyEmailOtp(email, devCode as string)),
    );
    const issued = races.filter((r) => r.status === 'fulfilled');
    expect(issued).toHaveLength(1);
  });

  it('rejects a code for an address with no account', async () => {
    const email = nextEmail();
    await auth.requestEmailOtp(email);
    await expect(auth.verifyEmailOtp(email, '000000')).rejects.toBeInstanceOf(ValidationError);
  });

  it('locks the challenge after five wrong codes', async () => {
    const email = nextEmail();
    await seedCustomerWithEmail(email);
    const { devCode } = await auth.requestEmailOtp(email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(auth.verifyEmailOtp(email, '000000')).rejects.toBeInstanceOf(ValidationError);
    }
    // Правильный код после исчерпания попыток уже не работает.
    await expect(auth.verifyEmailOtp(email, devCode as string)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses to reuse a consumed challenge', async () => {
    const email = nextEmail();
    await seedCustomerWithEmail(email);
    const { devCode } = await auth.requestEmailOtp(email);

    await auth.verifyEmailOtp(email, devCode as string);
    await expect(auth.verifyEmailOtp(email, devCode as string)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses an expired challenge', async () => {
    const email = nextEmail();
    await seedCustomerWithEmail(email);
    const { challengeId, devCode } = await auth.requestEmailOtp(email);
    await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(auth.verifyEmailOtp(email, devCode as string)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  describe('attaching an email to an account', () => {
    it('attaches only after the code sent to that address is confirmed', async () => {
      const email = nextEmail();
      const customer = await prisma.customer.create({
        data: { phone: nextPhone(), name: 'Без почты' },
      });

      const { devCode } = await auth.requestEmailAttach(customer.id, email);
      expect(devCode).toMatch(/^\d{6}$/);

      // До подтверждения адрес к аккаунту не привязан.
      expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.email).toBeNull();

      await auth.confirmEmailAttach(customer.id, email, devCode as string);
      expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.email).toBe(email);

      // И сразу же по нему можно войти.
      const login = await auth.requestEmailOtp(email);
      const tokens = await auth.verifyEmailOtp(email, login.devCode as string);
      expect((await auth.verifyAccessToken(tokens.accessToken)).customerId).toBe(customer.id);
    });

    it('refuses an address already attached to another account', async () => {
      const email = nextEmail();
      await seedCustomerWithEmail(email);
      const other = await prisma.customer.create({
        data: { phone: nextPhone(), name: 'Другой' },
      });

      const { devCode } = await auth.requestEmailAttach(other.id, email);
      await expect(
        auth.confirmEmailAttach(other.id, email, devCode as string),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a malformed address before issuing any code', async () => {
      const customer = await prisma.customer.create({
        data: { phone: nextPhone(), name: 'Кривой ввод' },
      });
      await expect(auth.requestEmailAttach(customer.id, 'не-почта')).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(await prisma.otpChallenge.count({ where: { email: 'не-почта' } })).toBe(0);
    });
  });
});
