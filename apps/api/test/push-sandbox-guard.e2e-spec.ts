import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { PaymentIntentsService } from '../src/payments/payment-intents.service';
import { SandboxPaymentsController } from '../src/payments/sandbox-payments.controller';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RateLimitModule } from '../src/rate-limit/rate-limit.module';

/**
 * SEC-011: push-token registration must be bound to the authenticated owner —
 * anonymous registration is refused and a token already owned by another
 * customer/staff cannot be re-bound (push hijack).
 */
describe('SEC-011 push token ownership guard', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        NotificationsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.pushToken.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: `sec011-${RUN}` } } });
    await prisma.customer.deleteMany({ where: { phone: { startsWith: `+9965${RUN}` } } });
  });

  async function createCustomer(seq: number) {
    const customer = await prisma.customer.create({
      data: { phone: `+9965${RUN}${seq}`, name: `SEC011 Customer ${seq}` },
    });
    return {
      customer,
      accessToken: jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone }),
    };
  }

  it('rejects anonymous registration with 401 and writes nothing', async () => {
    await request(app.getHttpServer())
      .post('/notifications/push-tokens')
      .send({ token: `ExponentPushToken[sec011-anon-${RUN}]`, platform: 'ios', deviceId: 'anon-device' })
      .expect(401);

    expect(await prisma.pushToken.count()).toBe(0);
  });

  it('binds a token to the authenticated customer and lets the owner refresh it', async () => {
    const { customer, accessToken } = await createCustomer(1);
    const server = app.getHttpServer();
    const token = `ExponentPushToken[sec011-owner-${RUN}]`;

    const first = await request(server)
      .post('/notifications/push-tokens')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token, platform: 'ios', deviceId: 'device-1' })
      .expect(201);
    expect(first.body.scope).toBe('customer');
    expect(first.body.customerId).toBe(customer.id);

    const refreshed = await request(server)
      .post('/notifications/push-tokens')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token, platform: 'ios', deviceId: 'device-2' })
      .expect(201);
    expect(refreshed.body.id).toBe(first.body.id);
    expect(refreshed.body.deviceId).toBe('device-2');
    expect(refreshed.body.customerId).toBe(customer.id);
    expect(await prisma.pushToken.count({ where: { token } })).toBe(1);
  });

  it('rejects rebinding a token owned by another customer with 409', async () => {
    const owner = await createCustomer(2);
    const intruder = await createCustomer(3);
    const server = app.getHttpServer();
    const token = `ExponentPushToken[sec011-hijack-${RUN}]`;

    await request(server)
      .post('/notifications/push-tokens')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ token, platform: 'android', deviceId: 'owner-device' })
      .expect(201);

    const res = await request(server)
      .post('/notifications/push-tokens')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ token, platform: 'android', deviceId: 'intruder-device' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('push_token_already_bound');

    const stored = await prisma.pushToken.findUniqueOrThrow({ where: { token } });
    expect(stored.customerId).toBe(owner.customer.id);
    expect(stored.deviceId).toBe('owner-device');
  });

  it('rejects cross-scope rebinding: a customer JWT cannot take a staff token', async () => {
    const staff = await prisma.staffUser.create({
      data: { username: `sec011-${RUN}-staff`, passwordHash: 'not-used', role: 'seller' },
    });
    const staffToken = jwt.sign({ sub: staff.id, typ: 'staff', role: staff.role });
    const intruder = await createCustomer(4);
    const server = app.getHttpServer();
    const token = `ExponentPushToken[sec011-staff-${RUN}]`;

    const registered = await request(server)
      .post('/notifications/push-tokens')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token, platform: 'android', deviceId: 'staff-device' })
      .expect(201);
    expect(registered.body.scope).toBe('staff');
    expect(registered.body.staffId).toBe(staff.id);

    const res = await request(server)
      .post('/notifications/push-tokens')
      .set('Authorization', `Bearer ${intruder.accessToken}`)
      .send({ token, platform: 'android', deviceId: 'customer-device' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('push_token_already_bound');

    const stored = await prisma.pushToken.findUniqueOrThrow({ where: { token } });
    expect(stored.staffId).toBe(staff.id);
    expect(stored.customerId).toBeNull();
  });
});

/**
 * SEC-011: the sandbox payment confirm endpoint must stay behind an explicit
 * PAYMENTS_SANDBOX_CONFIRM_ENABLED=true flag (off by default) — otherwise anyone
 * who knows an intentId could mark a payment as succeeded.
 */
describe('SEC-011 sandbox payment confirm guard', () => {
  let app: INestApplication;
  const confirmSandboxIntent = jest.fn().mockResolvedValue({ idempotent: false });
  const savedFlag = process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), RateLimitModule],
      controllers: [SandboxPaymentsController],
      providers: [{ provide: PaymentIntentsService, useValue: { confirmSandboxIntent } }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (savedFlag === undefined) delete process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED;
    else process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED = savedFlag;
    await app.close();
  });

  beforeEach(() => {
    confirmSandboxIntent.mockClear();
    delete process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED;
  });

  it('returns 404 and never confirms while the flag is disabled', async () => {
    await request(app.getHttpServer())
      .post('/sandbox/payments/card/PI-SEC011/confirm')
      .send({ returnUrl: 'alistore://payment-return?orderId=o1' })
      .expect(404);

    expect(confirmSandboxIntent).not.toHaveBeenCalled();
  });

  it('confirms and redirects when PAYMENTS_SANDBOX_CONFIRM_ENABLED=true', async () => {
    process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED = 'true';

    const res = await request(app.getHttpServer())
      .post('/sandbox/payments/card/PI-SEC011/confirm')
      .redirects(0)
      .send({ returnUrl: 'alistore://payment-return?orderId=o1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('alistore://payment-return?orderId=o1');
    expect(confirmSandboxIntent).toHaveBeenCalledWith('PI-SEC011');
  });

  it('renders the paid page without a returnUrl when the flag is on', async () => {
    process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED = 'true';

    const res = await request(app.getHttpServer())
      .post('/sandbox/payments/mbank/PI-SEC011/confirm')
      .send({});
    expect(res.status).toBe(201); // Nest default for POST; the handler sends HTML via @Res
    expect(res.text).toContain('Тестовая оплата подтверждена');
  });
});
