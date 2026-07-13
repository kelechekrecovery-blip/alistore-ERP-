import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { CustomersModule } from '../src/customers/customers.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Customer-owned loyalty, addresses and settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = `${Date.now()}${Math.floor(Math.random() * 10_000)}`.slice(-8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        CustomersModule,
      ],
      providers: [JwtStrategy],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => app.close());

  async function customer(suffix: string, ltv = 0) {
    return prisma.customer.create({
      data: { phone: `+9967${run.slice(-6)}${suffix}`, name: `Account ${suffix}`, ltv },
    });
  }

  function token(value: { id: string; phone: string }) {
    return jwt.sign({ sub: value.id, typ: 'customer', phone: value.phone });
  }

  it('returns only the signed-in customer loyalty balance, level, coupons and history', async () => {
    const owner = await customer('01', 420_000);
    const other = await customer('02');
    await prisma.loyaltyEntry.createMany({ data: [
      { customerId: owner.id, label: 'Покупка', amount: 1500, sourceRef: `order:${run}` },
      { customerId: owner.id, label: 'Списание', amount: -300, sourceRef: `redeem:${run}` },
      { customerId: other.id, label: 'Чужой бонус', amount: 9999, sourceRef: `other:${run}` },
    ] });
    await prisma.customerCoupon.create({
      data: { customerId: owner.id, title: 'Аксессуары', code: `ACC-${run}`, valueLabel: '-10%' },
    });

    const response = await request(app.getHttpServer())
      .get('/customers/me/loyalty')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);
    expect(response.body).toMatchObject({ balance: 1200, conversion: 1, level: 'Gold' });
    expect(response.body.history).toHaveLength(2);
    expect(response.body.coupons).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('Чужой бонус');
  });

  it('creates one address on concurrent replay, rotates primary and rejects foreign mutation', async () => {
    const owner = await customer('03');
    const other = await customer('04');
    const key = `address-${run}`;
    const create = () => request(app.getHttpServer())
      .post('/customers/me/addresses')
      .set('Authorization', `Bearer ${token(owner)}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Дом', text: 'Бишкек, Чуй 154', comment: 'кв. 12' });
    const [first, replay] = await Promise.all([create(), create()]);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(first.body.id).toBe(replay.body.id);
    expect(first.body.isPrimary).toBe(true);

    await request(app.getHttpServer())
      .post('/customers/me/addresses')
      .set('Authorization', `Bearer ${token(owner)}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Работа', text: 'Бишкек, Киевская 44' })
      .expect(409);

    const second = await request(app.getHttpServer())
      .post('/customers/me/addresses')
      .set('Authorization', `Bearer ${token(owner)}`)
      .set('Idempotency-Key', `${key}-2`)
      .send({ title: 'Работа', text: 'Бишкек, Киевская 44', isPrimary: true })
      .expect(201);
    const rows = await request(app.getHttpServer())
      .get('/customers/me/addresses')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);
    expect(rows.body).toHaveLength(2);
    expect(rows.body[0]).toMatchObject({ id: second.body.id, isPrimary: true });

    await request(app.getHttpServer())
      .patch(`/customers/me/addresses/${first.body.id}`)
      .set('Authorization', `Bearer ${token(other)}`)
      .send({ isPrimary: true })
      .expect(422);
    expect(await prisma.customerAddress.count({ where: { customerId: owner.id } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'customer.address_created', refs: { has: owner.id } } })).toBe(2);
  });

  it('updates profile, consent and channel preferences for the JWT owner only', async () => {
    const owner = await customer('05');
    const other = await customer('06');
    const defaults = await request(app.getHttpServer())
      .get('/customers/me/settings')
      .set('Authorization', `Bearer ${token(owner)}`)
      .expect(200);
    expect(defaults.body).toMatchObject({ consent: false, push: true, whatsapp: true, service: true, promos: false });

    const updated = await request(app.getHttpServer())
      .patch('/customers/me/settings')
      .set('Authorization', `Bearer ${token(owner)}`)
      .send({ name: 'Айбек', consent: true, whatsapp: false, promos: true })
      .expect(200);
    expect(updated.body).toMatchObject({ id: owner.id, name: 'Айбек', consent: true, whatsapp: false, promos: true });

    const foreign = await request(app.getHttpServer())
      .get('/customers/me/settings')
      .set('Authorization', `Bearer ${token(other)}`)
      .expect(200);
    expect(foreign.body).toMatchObject({ id: other.id, consent: false, whatsapp: true, promos: false });
    expect(await prisma.auditEvent.count({ where: { type: 'customer.consent_changed', refs: { has: owner.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'customer.preferences_changed', refs: { has: owner.id } } })).toBe(1);
  });
});
