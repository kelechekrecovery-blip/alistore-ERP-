import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { ValidationError } from '../src/common/errors';
import { DisabledOtpSender } from '../src/auth/disabled-otp.sender';
import { NoopOtpSender } from '../src/auth/noop-otp.sender';
import type { OtpSender, SendOtpInput } from '../src/auth/otp-sender';

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

  function makeAuth(values: Record<string, string>, otpSender?: OtpSender) {
    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    return otpSender
      ? new AuthService(prisma, jwt, config, otpSender)
      : new AuthService(prisma, jwt, config);
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

  it('allows a review-session budget, then durably disables and audits the credential', async () => {
    const customer = await seedReviewAccount();
    const auth = makeAuth(configured());
    const startedAt = new Date();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(auth.verifyOtp(reviewPhone, reviewOtp)).resolves.toHaveProperty('accessToken');
    }
    await expect(auth.verifyOtp(reviewPhone, reviewOtp)).rejects.toBeInstanceOf(ValidationError);

    await expect(prisma.reviewLoginGuard.findUniqueOrThrow({
      where: { phone: reviewPhone },
    })).resolves.toMatchObject({
      attempts: 0,
      successes: 20,
      lockedUntil: null,
      disabledAt: expect.any(Date),
    });
    await expect(prisma.refreshToken.count({
      where: { customerId: customer.id, revokedAt: null },
    })).resolves.toBe(20);
    const events = await prisma.auditEvent.findMany({
      where: {
        type: { in: ['auth.review_login_success', 'auth.review_login_success_disabled'] },
        ts: { gte: startedAt },
      },
      orderBy: { ts: 'asc' },
    });
    expect(events).toHaveLength(20);
    expect(events.slice(0, -1).every((event) => event.type === 'auth.review_login_success')).toBe(true);
    expect(events.at(-1)?.type).toBe('auth.review_login_success_disabled');
  });
});

/**
 * Дойти до экрана кода.
 *
 * Механизм выше проверяется в `verifyOtp` — но добраться до него ревьюер не мог:
 * `requestOtp` первым делом зовёт `otpSender.assertOperational()`, а в бою стоит
 * `SMS_PROVIDER=disabled`, то есть 503 `sms_login_unavailable` до создания
 * вызова. Клиенты (iOS `AliStoreClientApp.swift`, витрина `/login`) показывают
 * поле кода только после успешного запроса, поэтому фиксированный код физически
 * некуда было ввести. Это и есть отказ App Store 2.1(a).
 */
describe('Auth: запрос кода для ревьюера при выключенном SMS', () => {
  let prisma: PrismaService;
  const reviewPhone = `+996702${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const strangerPhone = `+996703${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const reviewOtp = '515151';

  /** Фиксирует, ушла ли реальная отправка: у ревьюера её быть не должно. */
  class RecordingDisabledSender implements OtpSender {
    readonly name = 'disabled' as const;
    readonly sent: SendOtpInput[] = [];
    private readonly inner = new DisabledOtpSender();

    assertOperational(): void {
      this.inner.assertOperational();
    }

    async send(input: SendOtpInput): Promise<void> {
      this.sent.push(input);
      await this.inner.send(input);
    }
  }

  function makeAuth(values: Record<string, string>, sender: OtpSender) {
    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    return new AuthService(prisma, jwt, config, sender);
  }

  function configured() {
    return {
      NODE_ENV: 'production',
      SMS_PROVIDER: 'disabled',
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
    await prisma.otpChallenge.deleteMany({ where: { phone: { in: [reviewPhone, strangerPhone] } } });
  });

  afterAll(async () => {
    await prisma.otpChallenge.deleteMany({ where: { phone: { in: [reviewPhone, strangerPhone] } } });
    await prisma.$disconnect();
  });

  it('выдаёт вызов согласованному номеру, хотя SMS-канал отказывает', async () => {
    const sender = new RecordingDisabledSender();
    const auth = makeAuth(configured(), sender);

    const challenge = await auth.requestOtp(reviewPhone);

    expect(challenge.challengeId).toEqual(expect.any(String));
    // Код фиксирован и согласован через App Store Connect — отправлять его
    // некуда, и попытка отправки уронила бы запрос об DisabledOtpSender.
    expect(sender.sent).toHaveLength(0);
    // Эхо кода в проде запрещено при любых обстоятельствах.
    expect(challenge.devCode).toBeUndefined();
  });

  it('не расширяет обычный вход: чужому номеру по-прежнему 503', async () => {
    const auth = makeAuth(configured(), new RecordingDisabledSender());
    await expect(auth.requestOtp(strangerPhone)).rejects.toMatchObject({
      response: { code: 'sms_login_unavailable' },
    });
  });

  it('инертен без переменных: тот же номер получает 503', async () => {
    const auth = makeAuth(
      { NODE_ENV: 'production', SMS_PROVIDER: 'disabled' },
      new RecordingDisabledSender(),
    );
    await expect(auth.requestOtp(reviewPhone)).rejects.toMatchObject({
      response: { code: 'sms_login_unavailable' },
    });
  });

  it('инертен после истечения окна', async () => {
    const auth = makeAuth(
      { ...configured(), AUTH_REVIEW_UNTIL: new Date(Date.now() - 1000).toISOString() },
      new RecordingDisabledSender(),
    );
    await expect(auth.requestOtp(reviewPhone)).rejects.toMatchObject({
      response: { code: 'sms_login_unavailable' },
    });
  });

  /**
   * Обход существует ради одной цели — входа ревьюера. Восстановление доступа
   * отзывает чужие refresh-сессии, и открывать его тем же ключом нельзя.
   */
  it('не распространяется на восстановление доступа', async () => {
    const auth = makeAuth(configured(), new RecordingDisabledSender());
    await expect(auth.requestOtp(reviewPhone, 'recovery')).rejects.toMatchObject({
      response: { code: 'sms_login_unavailable' },
    });
  });
});

/**
 * Вызов, выданный обходом, обязан быть инертен для ВСЕХ потребителей.
 *
 * `verifyOtp` для согласованного номера идёт своей веткой и challenge не трогает —
 * но он не единственный, кто такие строки ищет. `completeSocialEnrollment`
 * (`auth.service.ts:823-839`) берёт непогашенный `channel='sms'`,
 * `purpose='login'` вызов и на верном коде вызывает
 * `customerByCanonicalPhoneOnTx(..., true)` — то есть СОЗДАЁТ покупателя и
 * привязывает к нему `CustomerIdentity`.
 *
 * До появления обхода этой строки не существовало ни для одного номера:
 * `assertOperational` резал запрос раньше. Значит обход, создающий обычный
 * claimable вызов, открыл бы посторонему путь привязать свой Apple-аккаунт к
 * номеру ревьюера и сохранить доступ после закрытия окна.
 */
describe('Auth: вызов из обхода не годится для привязки соц-аккаунта', () => {
  let prisma: PrismaService;
  const reviewPhone = `+996704${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const botToken = '123456:telegram-secret';

  function auth() {
    return new AuthService(
      prisma,
      new JwtService({ secret: 'test-secret' }),
      {
        get: (key: string) => ({
          NODE_ENV: 'production',
          SMS_PROVIDER: 'disabled',
          TELEGRAM_BOT_TOKEN: botToken,
          AUTH_REVIEW_PHONE: reviewPhone,
          AUTH_REVIEW_OTP: '626262',
          AUTH_REVIEW_UNTIL: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })[key],
      } as unknown as ConfigService,
      new DisabledOtpSender(),
    );
  }

  function signedInitData(subject: string): string {
    const params = new URLSearchParams();
    params.set('auth_date', String(Math.floor(Date.now() / 1000)));
    params.set('query_id', `query-${subject}`);
    params.set('user', JSON.stringify({ id: subject, first_name: 'Intruder' }));
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'));
    return params.toString();
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.socialEnrollment.deleteMany();
    await prisma.otpChallenge.deleteMany({ where: { phone: reviewPhone } });
    const customer = await prisma.customer.findUnique({ where: { phone: reviewPhone } });
    if (customer) {
      await prisma.customerIdentity.deleteMany({ where: { customerId: customer.id } });
      await prisma.refreshToken.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
  });

  afterAll(async () => {
    await prisma.otpChallenge.deleteMany({ where: { phone: reviewPhone } });
    await prisma.$disconnect();
  });

  it('привязка отвечает otp_not_found, а не otp_invalid — claimable строки нет', async () => {
    const service = auth();
    await service.requestOtp(reviewPhone);

    const enrollment = await service.loginWithTelegramV2({ initData: signedInitData('intruder-1') });
    if (enrollment.status !== 'enrollment_required') throw new Error('ожидался enrollment');

    /**
     * Различие кодов — суть проверки, а не придирка к формулировке.
     * `otp_invalid` означает, что строка НАЙДЕНА и попытка списана: значит
     * перебор шестизначного кода имеет смысл. `otp_not_found` означает, что
     * брать нечего ни при каком коде.
     */
    await expect(service.completeSocialEnrollment({
      enrollmentToken: enrollment.enrollmentToken,
      phone: reviewPhone,
      code: '000000',
    })).rejects.toMatchObject({ code: 'otp_not_found' });

    await expect(prisma.customer.findUnique({ where: { phone: reviewPhone } })).resolves.toBeNull();
  });

  it('в базе не остаётся непогашенного sms/login вызова для этого номера', async () => {
    const service = auth();
    await service.requestOtp(reviewPhone);

    // Ровно тот предикат, которым ищет привязка соц-аккаунта.
    const claimable = await prisma.otpChallenge.count({
      where: {
        phone: reviewPhone,
        channel: 'sms',
        purpose: 'login',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    expect(claimable).toBe(0);
  });
});

/**
 * Гигиена намеренного обхода: он не должен ни подсовывать бесполезный код, ни
 * происходить бесследно.
 */
describe('Auth: обход входа ревьюера — эхо кода и след в леджере', () => {
  let prisma: PrismaService;
  const reviewPhone = `+996705${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;

  function makeAuth(values: Record<string, string>, sender: OtpSender) {
    const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
    const config = { get: (key: string) => values[key] } as unknown as ConfigService;
    return new AuthService(prisma, jwt, config, sender);
  }

  function reviewEnv() {
    return {
      AUTH_REVIEW_PHONE: reviewPhone,
      AUTH_REVIEW_OTP: '737373',
      AUTH_REVIEW_UNTIL: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.otpChallenge.deleteMany({ where: { phone: reviewPhone } });
  });

  afterAll(async () => {
    await prisma.otpChallenge.deleteMany({ where: { phone: reviewPhone } });
    await prisma.$disconnect();
  });

  /**
   * Вне production эхо кода включено для удобства разработки — но для
   * согласованного номера сгенерированный код бесполезен: `verifyOtp` уходит в
   * ветку ревью и сверяет фиксированное значение. Отдать его значит выдать
   * тестировщику заведомо неработающий код и потратить его время на «код не
   * подходит» при валидном коде.
   */
  it('не подсовывает devCode для согласованного номера — он всё равно не сработает', async () => {
    const auth = makeAuth(
      { NODE_ENV: 'test', AUTH_OTP_DEV_ECHO: 'true', ...reviewEnv() },
      new NoopOtpSender(),
    );

    const challenge = await auth.requestOtp(reviewPhone);

    expect(challenge.challengeId).toEqual(expect.any(String));
    expect(challenge.devCode).toBeUndefined();
  });

  it('обычный номер эхо по-прежнему получает', async () => {
    const otherPhone = `+996706${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
    const auth = makeAuth(
      { NODE_ENV: 'test', AUTH_OTP_DEV_ECHO: 'true', ...reviewEnv() },
      new NoopOtpSender(),
    );

    const challenge = await auth.requestOtp(otherPhone);

    expect(challenge.devCode).toMatch(/^\d{6}$/);
    await prisma.otpChallenge.deleteMany({ where: { phone: otherPhone } });
  });

  /**
   * Обход канала — событие безопасности. Успех и провал самого входа уже пишутся
   * (`auth.review_login_*`), но факт «для этого номера выпущен вызов в обход
   * отключённого SMS» не фиксировался нигде, и восстановить постфактум, когда и
   * сколько раз обходом пользовались, было нельзя.
   */
  it('пишет в леджер факт выдачи вызова в обход канала', async () => {
    const startedAt = new Date();
    const auth = makeAuth(
      { NODE_ENV: 'production', SMS_PROVIDER: 'disabled', ...reviewEnv() },
      new DisabledOtpSender(),
    );

    await auth.requestOtp(reviewPhone);

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'auth.review_login_challenge_issued', ts: { gte: startedAt } },
      orderBy: { ts: 'desc' },
    });
    expect(event).not.toBeNull();
    // Номер — персональные данные и он же секрет обхода: в леджер идёт хеш.
    expect(JSON.stringify(event)).not.toContain(reviewPhone);
  });
});
