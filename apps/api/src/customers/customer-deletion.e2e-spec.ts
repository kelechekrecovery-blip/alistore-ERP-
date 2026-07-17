import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../audit/audit.module';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { NoopOtpSender } from '../auth/noop-otp.sender';
import { OTP_SENDER } from '../auth/otp-sender';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersModule } from './customers.module';

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

  it('anonymizes PII, erases addresses/identities and revokes every session', async () => {
    const owner = await customer('11', true);
    await prisma.customerAddress.create({
      data: { customerId: owner.id, title: 'Дом', text: 'Бишкек, Чуй 1' },
    });
    await prisma.customerIdentity.create({
      data: { customerId: owner.id, provider: 'apple', subject: `sub-${run}` },
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
      .set('Authorization', `Bearer ${token(owner)}`)
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
    expect(await prisma.pushToken.count({ where: { customerId: owner.id } })).toBe(0);
    const sessions = await prisma.refreshToken.findMany({ where: { customerId: owner.id } });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    expect(await prisma.auditEvent.count({ where: { type: 'customer.deleted', refs: { has: owner.id } } })).toBe(1);
    // consent flipped true → false, so campaigns see the withdrawal event
    expect(await prisma.auditEvent.count({ where: { type: 'customer.consent_changed', refs: { has: owner.id } } })).toBe(1);

    // repeat deletion is an idempotent no-op (no second ledger event)
    await request(app.getHttpServer())
      .delete('/customers/me')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);
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
