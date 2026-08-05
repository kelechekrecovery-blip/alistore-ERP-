import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AuditModule } from '../audit/audit.module';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { NoopOtpSender } from '../auth/noop-otp.sender';
import { OTP_SENDER } from '../auth/otp-sender';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersModule } from './customers.module';
import { CustomersService } from './customers.service';
import { issueGuestCheckoutCapability, requireActiveGuestCapability } from '../auth/guest-capability';

/**
 * GAP-ACCOUNT-DELETE-001 — self-service account deletion and data export.
 * Deletion anonymizes PII in place (the customer row must survive: orders,
 * payments, loyalty and the append-only ledger reference it), frees the unique
 * phone for re-registration and revokes every refresh session.
 */
describe('Customer account deletion and export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let auth: AuthService;
  let customers: CustomersService;
  const run = `${Date.now()}${Math.floor(Math.random() * 10_000)}`.slice(-8);

  beforeAll(async () => {
    process.env.AUTH_OTP_DEV_ECHO = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        CustomersModule,
      ],
      providers: [JwtStrategy, AuthService, { provide: OTP_SENDER, useClass: NoopOtpSender }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    auth = moduleRef.get(AuthService);
    customers = moduleRef.get(CustomersService);
  });

  afterAll(async () => app.close());

  async function customer(suffix: string, consent = false) {
    return prisma.customer.create({
      data: { phone: `+9967${run.slice(-6)}${suffix}`, name: `Аккаунт ${suffix}`, consent },
    });
  }

  function token(value: { id: string; phone: string }) {
    return jwt.sign({ sub: value.id, typ: 'customer', phone: value.phone });
  }

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  async function waitForDeleteCommitOrLock(customerId: string) {
    // A separate pg client is intentional: the app test pool is capped at two
    // connections, both occupied by the forced race below.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg');
    const observer = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await observer.connect();
    try {
      const deadline = Date.now() + 5_000;
      for (;;) {
        const observed = await observer.query(`
          SELECT
            EXISTS (
              SELECT 1 FROM "Customer"
              WHERE id = $1 AND phone = $2
            ) AS deleted,
            EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE pid <> pg_backend_pid()
                AND datname = current_database()
                AND state = 'active'
                AND wait_event_type = 'Lock'
                AND query LIKE '%FROM "Customer"%FOR UPDATE%'
            ) AS blocked
        `, [customerId, `deleted:${customerId}`]);
        if (observed.rows[0]?.deleted || observed.rows[0]?.blocked) return;
        if (Date.now() >= deadline) {
          throw new Error(`deletion did not commit or wait on Customer ${customerId}`);
        }
        await new Promise<void>((done) => setImmediate(done));
      }
    } finally {
      await observer.end();
    }
  }

  it('anonymizes PII, erases addresses/identities and revokes every session', async () => {
    const owner = await customer('11', true);
    const ownerAccessToken = token(owner);
    const preDeletionGuestCapability = issueGuestCheckoutCapability(owner.id);
    await prisma.customerAddress.create({
      data: { customerId: owner.id, title: 'Дом', text: 'Бишкек, Чуй 1' },
    });
    await prisma.customerIdentity.create({
      data: { customerId: owner.id, provider: 'apple', subject: `sub-${run}` },
    });
    const telegramIdentity = await prisma.telegramAgentIdentity.create({
      data: {
        customerId: owner.id,
        telegramUserId: `tg-${run}`,
        chatId: `chat-${run}`,
        kind: 'customer',
      },
    });
    await prisma.telegramAgentMessage.create({
      data: {
        externalKey: `telegram:delete:${run}`,
        identityId: telegramIdentity.id,
        telegramUserId: telegramIdentity.telegramUserId,
        chatId: telegramIdentity.chatId,
        direction: 'inbound',
        text: 'Личные данные клиента',
        status: 'answered',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const telegramOutbox = await prisma.outboxMessage.create({
      data: {
        id: `telegram-customer-delete-${run}`,
        channel: 'telegram',
        recipient: telegramIdentity.chatId,
        template: 'telegram_agent_reply',
        payload: { message: 'История заказа клиента' },
      },
    });
    await prisma.pushToken.create({
      data: { customerId: owner.id, token: `push-${run}`, platform: 'ios', deviceId: `device-${run}` },
    });
    await prisma.refreshToken.createMany({
      data: [1, 2].map((n) => ({
        customerId: owner.id,
        tokenHash: `hash-${n}-${run}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    });

    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ id: owner.id, deleted: true }));

    const anonymized = await prisma.customer.findUnique({ where: { id: owner.id } });
    expect(anonymized).toMatchObject({
      name: 'Удалённый пользователь',
      phone: `deleted:${owner.id}`,
      consent: false,
    });
    expect(await prisma.customerAddress.count({ where: { customerId: owner.id } })).toBe(0);
    expect(await prisma.customerIdentity.count({ where: { customerId: owner.id } })).toBe(0);
    expect(await prisma.telegramAgentIdentity.count({ where: { customerId: owner.id } })).toBe(0);
    expect(await prisma.telegramAgentMessage.count({
      where: { telegramUserId: telegramIdentity.telegramUserId },
    })).toBe(0);
    expect(await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: telegramOutbox.id },
    })).toMatchObject({
      status: 'cancelled',
      recipient: `revoked:${telegramIdentity.id}`,
      payload: { redacted: true, reason: 'customer_account_deleted' },
    });
    expect(await prisma.pushToken.count({ where: { customerId: owner.id } })).toBe(0);
    const sessions = await prisma.refreshToken.findMany({ where: { customerId: owner.id } });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    expect(await prisma.auditEvent.count({ where: { type: 'customer.deleted', refs: { has: owner.id } } })).toBe(1);
    // consent flipped true → false, so campaigns see the withdrawal event
    expect(await prisma.auditEvent.count({ where: { type: 'customer.consent_changed', refs: { has: owner.id } } })).toBe(1);
    for (const scope of ['orders:create', 'payments:intent', 'payments:gift_card', 'support:create', 'warranty:create', 'tradeins:create', 'evidence:write', 'evidence:read'] as const) {
      await expect(requireActiveGuestCapability(prisma, preDeletionGuestCapability, scope, owner.id))
        .rejects.toThrow('guest_capability_revoked');
    }

    // Account deletion is a session-revocation boundary: a signed access JWT
    // issued before deletion must fail on both HTTP and non-HTTP transports.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(401)
      .expect(({ body }) => expect(body).toMatchObject({
        statusCode: 401,
        message: 'customer_session_revoked',
      }));
    await request(app.getHttpServer())
      .get('/customers/me/export')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(401);
    await expect(auth.verifyAccessToken(ownerAccessToken)).rejects.toThrow();

    // Idempotency remains a service invariant, but an already-revoked HTTP
    // session cannot invoke it a second time.
    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(401);
    await expect(customers.deleteAccount(owner.id)).resolves.toEqual({ id: owner.id, deleted: true });
    expect(await prisma.auditEvent.count({ where: { type: 'customer.deleted', refs: { has: owner.id } } })).toBe(1);
  });

  it('frees the phone so the same number OTP-registers again as a fresh customer', async () => {
    const phone = `+9967${run.slice(-6)}22`;
    const owner = await prisma.customer.create({ data: { phone, name: 'Старый аккаунт' } });
    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);

    const { devCode } = await auth.requestOtp(phone);
    expect(devCode).toBeTruthy();
    const tokens = await auth.verifyOtp(phone, devCode!);
    expect(tokens.accessToken).toBeTruthy();

    const fresh = await prisma.customer.findUnique({ where: { phone } });
    expect(fresh).not.toBeNull();
    expect(fresh!.id).not.toBe(owner.id);
    const oldRow = await prisma.customer.findUnique({ where: { id: owner.id } });
    expect(oldRow!.phone).toBe(`deleted:${owner.id}`);
  });

  it('rejects both access and refresh credentials after account deletion', async () => {
    const owner = await customer('12');
    const challenge = await auth.requestOtp(owner.phone);
    const session = await auth.verifyOtp(owner.phone, challenge.devCode!, challenge.challengeId);

    await request(app.getHttpServer())
      .get('/customers/me/settings')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/customers/me/settings')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({
      code: expect.stringMatching(/^refresh_(?:invalid|reused)$/u),
    });
    expect(await prisma.refreshToken.count({
      where: { customerId: owner.id, revokedAt: null },
    })).toBe(0);
  });

  it('never leaves credentials live when login issuance races account deletion', async () => {
    const owner = await customer('13');
    const challenge = await auth.requestOtp(owner.phone);
    const atIssue = deferred();
    const resumeIssue = deferred();
    const authJwt = (auth as unknown as { jwt: JwtService }).jwt;
    const originalSignAsync = authJwt.signAsync.bind(authJwt);
    const sign = jest.spyOn(authJwt, 'signAsync').mockImplementationOnce(async (payload, options) => {
      atIssue.resolve();
      await resumeIssue.promise;
      return originalSignAsync(payload, options);
    });

    try {
      const issuance = auth.verifyOtp(owner.phone, challenge.devCode!, challenge.challengeId);
      await Promise.race([
        atIssue.promise,
        issuance.then(
          () => Promise.reject(new Error('credential issuance completed before the sign gate')),
          (error) => Promise.reject(error),
        ),
      ]);
      const deletion = customers.deleteAccount(owner.id);
      await waitForDeleteCommitOrLock(owner.id);
      resumeIssue.resolve();

      const [issued, deleted] = await Promise.allSettled([issuance, deletion]);
      expect(issued).toMatchObject({ status: 'fulfilled' });
      expect(deleted).toMatchObject({ status: 'fulfilled' });
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: owner.id } }))
        .toMatchObject({ phone: `deleted:${owner.id}` });
      expect(await prisma.refreshToken.count({
        where: { customerId: owner.id, revokedAt: null },
      })).toBe(0);

      if (issued.status === 'fulfilled') {
        await request(app.getHttpServer())
          .get('/customers/me/settings')
          .set('Authorization', `Bearer ${issued.value.accessToken}`)
          .expect(401);
      }
    } finally {
      resumeIssue.resolve();
      sign.mockRestore();
    }
  });

  it('rejects issuance when account deletion obtains the customer lock first', async () => {
    const owner = await customer('15');
    const challenge = await auth.requestOtp(owner.phone);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg');
    const blocker = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await blocker.connect();
    let transactionOpen = false;
    try {
      await blocker.query('BEGIN');
      transactionOpen = true;
      await blocker.query('SELECT id FROM "Customer" WHERE id = $1 FOR UPDATE', [owner.id]);

      const deletion = customers.deleteAccount(owner.id);
      await waitForDeleteCommitOrLock(owner.id);
      const issuance = auth.verifyOtp(owner.phone, challenge.devCode!, challenge.challengeId);
      await blocker.query('COMMIT');
      transactionOpen = false;

      await expect(deletion).resolves.toEqual({ id: owner.id, deleted: true });
      await expect(issuance).rejects.toMatchObject({
        code: expect.stringMatching(/^(?:customer_session_revoked|otp_invalid)$/u),
      });
      expect(await prisma.refreshToken.count({
        where: { customerId: owner.id, revokedAt: null },
      })).toBe(0);
    } finally {
      if (transactionOpen) await blocker.query('ROLLBACK');
      await blocker.end();
    }
  });

  it('does not reuse a claimed pre-deletion OTP for a fresh customer id', async () => {
    const owner = await customer('16');
    const challenge = await auth.requestOtp(owner.phone);
    const atTransactionGap = deferred();
    const resumeTransaction = deferred();
    const originalTransaction = prisma.$transaction.bind(prisma);
    const transaction = jest.spyOn(prisma as any, '$transaction').mockImplementationOnce(
      async (...args: any[]) => {
        atTransactionGap.resolve();
        await resumeTransaction.promise;
        return (originalTransaction as any)(...args);
      },
    );

    try {
      const issuance = auth.verifyOtp(owner.phone, challenge.devCode!, challenge.challengeId);
      await atTransactionGap.promise;
      await expect(customers.deleteAccount(owner.id)).resolves.toEqual({ id: owner.id, deleted: true });
      resumeTransaction.resolve();

      await expect(issuance).rejects.toMatchObject({ code: 'customer_session_revoked' });
      expect(await prisma.customer.count({ where: { phone: owner.phone } })).toBe(0);
      expect(await prisma.refreshToken.count({
        where: { customerId: owner.id, revokedAt: null },
      })).toBe(0);
    } finally {
      resumeTransaction.resolve();
      transaction.mockRestore();
    }
  });

  it('rejects customer PII mutations that reach services after deletion commits', async () => {
    const owner = await customer('17');
    await expect(customers.deleteAccount(owner.id)).resolves.toEqual({ id: owner.id, deleted: true });

    const attempts = await Promise.allSettled([
      customers.createAddress(
        owner.id,
        { title: 'Дом', text: 'Бишкек, адрес после удаления', isPrimary: true },
        `post-delete-address-${run}`,
      ),
      customers.updateSettings(owner.id, {
        name: 'Восстановленные ПДн',
        consent: true,
        promos: true,
      }),
    ]);
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt).toMatchObject({
        status: 'rejected',
        reason: { code: 'customer_session_revoked' },
      });
    }
    expect(await prisma.customerAddress.count({ where: { customerId: owner.id } })).toBe(0);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      name: 'Удалённый пользователь',
      consent: false,
    });
  });

  it('rejects an address write after its JWT passed but deletion commits first', async () => {
    const owner = await customer('18');
    const accessToken = token(owner);
    const enteredService = deferred();
    const resumeService = deferred();
    const original = customers.createAddress.bind(customers);
    const createAddress = jest.spyOn(customers, 'createAddress').mockImplementationOnce(
      async (customerId, dto, idempotencyKey) => {
        enteredService.resolve();
        await resumeService.promise;
        return original(customerId, dto, idempotencyKey);
      },
    );

    try {
      const mutation = request(app.getHttpServer())
        .post('/customers/me/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', `delete-race-address-${run}`)
        .send({ title: 'Дом', text: 'Секретный адрес', isPrimary: true });
      const mutationResult = mutation.then((response) => response);
      await Promise.race([
        enteredService.promise,
        mutationResult.then(() => Promise.reject(new Error('address mutation passed the gate early'))),
      ]);

      await request(app.getHttpServer())
        .delete('/customers/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      resumeService.resolve();

      const response = await mutationResult;
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'customer_session_revoked',
      });
      expect(await prisma.customerAddress.count({ where: { customerId: owner.id } })).toBe(0);
      expect(await prisma.auditEvent.count({
        where: { type: 'customer.address_created', refs: { has: owner.id } },
      })).toBe(0);
    } finally {
      resumeService.resolve();
      createAddress.mockRestore();
    }
  });

  it('rejects a settings write after its JWT passed but deletion commits first', async () => {
    const owner = await customer('19');
    const accessToken = token(owner);
    const enteredService = deferred();
    const resumeService = deferred();
    const original = customers.updateSettings.bind(customers);
    const updateSettings = jest.spyOn(customers, 'updateSettings').mockImplementationOnce(
      async (customerId, dto) => {
        enteredService.resolve();
        await resumeService.promise;
        return original(customerId, dto);
      },
    );

    try {
      const mutation = request(app.getHttpServer())
        .patch('/customers/me/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Возвращённые ПДн', consent: true, push: true, promos: true });
      const mutationResult = mutation.then((response) => response);
      await Promise.race([
        enteredService.promise,
        mutationResult.then(() => Promise.reject(new Error('settings mutation passed the gate early'))),
      ]);

      await request(app.getHttpServer())
        .delete('/customers/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      resumeService.resolve();

      const response = await mutationResult;
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'customer_session_revoked',
      });
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
        name: 'Удалённый пользователь',
        consent: false,
      });
    } finally {
      resumeService.resolve();
      updateSettings.mockRestore();
    }
  });

  it('revokes the rotated child when refresh wins a race with account deletion', async () => {
    const owner = await customer('14');
    const challenge = await auth.requestOtp(owner.phone);
    const session = await auth.verifyOtp(owner.phone, challenge.devCode!, challenge.challengeId);
    const atIssue = deferred();
    const resumeIssue = deferred();
    const authJwt = (auth as unknown as { jwt: JwtService }).jwt;
    const originalSignAsync = authJwt.signAsync.bind(authJwt);
    const sign = jest.spyOn(authJwt, 'signAsync').mockImplementationOnce(async (payload, options) => {
      atIssue.resolve();
      await resumeIssue.promise;
      return originalSignAsync(payload, options);
    });

    try {
      const refresh = auth.refresh(session.refreshToken);
      await Promise.race([
        atIssue.promise,
        refresh.then(
          () => Promise.reject(new Error('refresh completed before the sign gate')),
          (error) => Promise.reject(error),
        ),
      ]);
      const deletion = customers.deleteAccount(owner.id);
      await waitForDeleteCommitOrLock(owner.id);
      resumeIssue.resolve();

      const [rotated, deleted] = await Promise.allSettled([refresh, deletion]);
      expect(rotated).toMatchObject({ status: 'fulfilled' });
      expect(deleted).toMatchObject({ status: 'fulfilled' });
      expect(await prisma.refreshToken.count({
        where: { customerId: owner.id, revokedAt: null },
      })).toBe(0);
      expect(await prisma.refreshToken.count({
        where: { customerId: owner.id, rotatedAt: { not: null } },
      })).toBe(0);
      if (rotated.status === 'fulfilled') {
        await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${rotated.value.accessToken}`)
          .expect(401);
        await expect(auth.refresh(rotated.value.refreshToken)).rejects.toMatchObject({
          code: expect.stringMatching(/^refresh_(?:invalid|reused)$/u),
        });
      }
    } finally {
      resumeIssue.resolve();
      sign.mockRestore();
    }
  });

  // Переименование `customer.phone` в `deleted:<id>` освобождает номер, но не стирает
  // его: каждый вход по OTP оставляет строку `OtpChallenge` с телефоном в открытом
  // виде, и её никто не удалял ни при удалении аккаунта, ни по сроку. Обещание
  // политики («данные удаляются») выполнялось только в таблице `Customer`.
  it('стирает телефон из OtpChallenge — после удаления его нет ни в одной таблице', async () => {
    const phone = `+9967${run.slice(-6)}77`;
    const { devCode } = await auth.requestOtp(phone);
    await auth.verifyOtp(phone, devCode!);
    const owner = await prisma.customer.findUnique({ where: { phone } });
    expect(owner).not.toBeNull();
    // предусловие: телефон действительно лежит в OtpChallenge открытым текстом
    expect(await prisma.otpChallenge.count({ where: { phone } })).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${token(owner!)}`)
      .expect(200);

    expect(await prisma.otpChallenge.count({ where: { phone } })).toBe(0);
  });

  it('закрывает и почтовую дверь: по привязанному адресу удалённый аккаунт не воскресает', async () => {
    const email = `deleted${run.slice(-6)}@emaildelete.test`;
    const owner = await customer('88');
    await prisma.customer.update({ where: { id: owner.id }, data: { email } });
    // Предусловие проверяем детерминированным challenge: этот тест отвечает за
    // удаление аккаунта, а не за асинхронный dev-echo транспорт email.
    const emailCode = '482915';
    const before = await prisma.otpChallenge.create({
      data: {
        email,
        channel: 'email',
        purpose: 'login',
        codeHash: await argon2.hash(emailCode),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    await expect(auth.verifyEmailOtp(email, emailCode, before.id))
      .resolves.toMatchObject({ accessToken: expect.any(String) });

    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);

    // Переименование телефона в `deleted:<id>` раньше само закрывало вход: под
    // регулярку RequestOtpDto такой «номер» не подходит. Почта этой защиты не
    // наследует — её надо снимать явно, иначе любой, кто владеет ящиком, получит
    // полный токен на «удалённый» аккаунт с историей заказов и бонусами.
    const after = await prisma.customer.findUnique({ where: { id: owner.id } });
    expect(after?.email).toBeNull();
    // Удаление снесло и вызовы по адресу — адрес не должен остаться в базе
    // открытым текстом. Считаем здесь: следующий запрос кода намеренно создаёт
    // строку и для неизвестного адреса, чтобы не выдавать наличие аккаунта.
    expect(await prisma.otpChallenge.count({ where: { email } })).toBe(0);

    const issued = await auth.requestEmailOtp(email);
    expect(issued.devCode).toBeUndefined();
    await expect(auth.verifyEmailOtp(email, emailCode)).rejects.toThrow();
  });

  it('keeps orders and ledger rows intact for accounting', async () => {
    const owner = await customer('33');
    const order = await prisma.order.create({
      data: { customerId: owner.id, channel: 'web', total: 1500 },
    });
    await prisma.auditEvent.create({
      data: { type: 'order.created', actor: owner.id, payload: { orderId: order.id }, refs: [owner.id, order.id] },
    });

    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);

    const surviving = await prisma.order.findUnique({ where: { id: order.id } });
    expect(surviving).toMatchObject({ customerId: owner.id, total: 1500 });
    expect(await prisma.auditEvent.count({ where: { refs: { has: order.id } } })).toBe(1);
  });

  /**
   * Удаление обязано убрать ПДн из мест, где они не нужны бухгалтерии:
   * имя клиента с публичного отзыва и номер паспорта из скупки Б/У. Сами
   * заказы, сделки и события остаются — они нужны учёту и анти-фроду.
   */
  it('обезличивает публичный отзыв и очищает паспорт скупки', async () => {
    const owner = await customer('66');
    const product = await prisma.product.create({
      data: { sku: `DEL-REV-${run}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    const soldOrder = await prisma.order.create({
      data: { customerId: owner.id, channel: 'web', status: 'completed', total: 100000 },
    });
    await prisma.productReview.create({
      data: { productId: product.id, sku: product.sku, orderId: soldOrder.id, customerId: owner.id, customerName: 'Нурбек Асанов', rating: 5, text: 'Отлично, звоните 0555', status: 'approved' },
    });
    await prisma.tradeInDevice.create({
      data: { customerId: owner.id, model: `TI-DEL-${run}`, grade: 'B', price: 40000, sellerPassport: 'AN7654321' },
    });

    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);

    const review = await prisma.productReview.findFirstOrThrow({ where: { customerId: owner.id } });
    expect(review.customerName).not.toContain('Нурбек');
    const tradeIn = await prisma.tradeInDevice.findFirstOrThrow({ where: { customerId: owner.id } });
    expect(tradeIn.sellerPassport).toBe('');

    await prisma.productReview.deleteMany({ where: { customerId: owner.id } });
    await prisma.tradeInDevice.deleteMany({ where: { customerId: owner.id } });
    await prisma.order.deleteMany({ where: { id: soldOrder.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
  });

  it('exports only the signed-in customer data and rejects staff tokens', async () => {
    const owner = await customer('44');
    const other = await customer('55');
    await prisma.customerAddress.create({
      data: { customerId: owner.id, title: 'Дом', text: 'Бишкек, Ибраимова 100' },
    });
    await prisma.loyaltyEntry.create({
      data: { customerId: owner.id, label: 'Покупка', amount: 500, sourceRef: `export:${run}` },
    });
    await prisma.customerCoupon.create({
      data: { customerId: owner.id, title: 'Скидка', code: `EXP-${run}`, valueLabel: '-5%' },
    });
    const order = await prisma.order.create({
      data: { customerId: owner.id, channel: 'app', total: 4200 },
    });
    await prisma.customerPreferences.create({
      data: { customerId: owner.id, push: false, whatsapp: true, service: true, promos: true },
    });

    const response = await request(app.getHttpServer())
      .get('/customers/me/export')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);
    expect(response.body.profile).toMatchObject({ id: owner.id, phone: owner.phone, name: owner.name });
    expect(response.body.addresses).toEqual([expect.objectContaining({ text: 'Бишкек, Ибраимова 100' })]);
    expect(response.body.orders).toEqual([expect.objectContaining({ id: order.id, status: 'draft', total: 4200 })]);
    expect(response.body.loyaltyEntries).toEqual([expect.objectContaining({ label: 'Покупка', amount: 500 })]);
    expect(response.body.coupons).toEqual([expect.objectContaining({ code: `EXP-${run}` })]);
    expect(response.body.notifications).toMatchObject({ consent: false, push: false, whatsapp: true, promos: true });

    const foreign = await request(app.getHttpServer())
      .get('/customers/me/export')
      .set('Authorization', `Bearer ${token(other)}`)
      .expect(200);
    expect(JSON.stringify(foreign.body)).not.toContain(owner.phone);
    expect(foreign.body.orders).toHaveLength(0);

    const staffToken = jwt.sign({ sub: 'staff-1', typ: 'staff', role: 'admin' });
    await request(app.getHttpServer())
      .get('/customers/me/export')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });
});
