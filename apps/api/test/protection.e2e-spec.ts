import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProtectionModule } from '../src/protection/protection.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Device protection policies', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let staffAuth: StaffAuthService;
  let sellerToken: string;
  let adminToken: string;
  let adminId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        ProtectionModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    staffAuth = moduleRef.get(StaffAuthService);

    const seller = await staffAuth.createStaff(`protection-seller-${RUN}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(seller.username, 'pass')).accessToken;
    const admin = await staffAuth.createStaff(`protection-admin-${RUN}`, 'pass', 'admin');
    adminId = admin.id;
    adminToken = (await staffAuth.login(admin.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.deviceProtectionPolicy.deleteMany({ where: { customerId: { startsWith: `protection-${RUN}` } } });
    await prisma.deviceUnit.deleteMany({ where: { imei: { startsWith: `PROTECT-${RUN}` } } });
    const orders = await prisma.order.findMany({
      where: { channel: 'protection_test' },
      select: { id: true },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `PROTECT-${RUN}` } } });
    await prisma.customer.deleteMany({ where: { id: { startsWith: `protection-${RUN}` } } });
    await prisma.staffUser.deleteMany({ where: { username: { contains: `-${RUN}` } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.deviceProtectionPolicy.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { type: { startsWith: 'protection.' } } });
  });

  function token(customerId: string, phone: string) {
    return jwt.sign({ sub: customerId, typ: 'customer', phone });
  }

  async function soldDeviceFixture() {
    seq += 1;
    const customer = await prisma.customer.create({
      data: {
        id: `protection-${RUN}-${seq}`,
        phone: `+99674${String(RUN).padStart(6, '0').slice(0, 6)}${String(seq).padStart(2, '0')}`,
        name: 'Protection Buyer',
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: `PROTECT-${RUN}-${seq}`,
        name: 'iPhone Protected',
        price: 100_000,
        cost: 80_000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'protection_test',
        status: 'paid',
        total: product.price,
        items: { create: { sku: product.sku, qty: 1, price: product.price } },
      },
    });
    const unit = await prisma.deviceUnit.create({
      data: {
        imei: `PROTECT-${RUN}-${seq}-IMEI`,
        productId: product.id,
        status: 'sold',
        location: 'BISHKEK-1',
        orderId: order.id,
      },
    });
    return { customer, product, order, unit, token: token(customer.id, customer.phone) };
  }

  it('allows only the device owner to request protection and writes a trusted premium quote', async () => {
    const fixture = await soldDeviceFixture();
    const other = await prisma.customer.create({
      data: {
        id: `protection-${RUN}-other-${seq}`,
        phone: `+99675${String(RUN).padStart(6, '0').slice(0, 6)}${String(seq).padStart(2, '0')}`,
        name: 'Other Buyer',
      },
    });

    await request(app.getHttpServer()).post('/protection/policies').send({}).expect(401);
    await request(app.getHttpServer())
      .post('/protection/policies')
      .set('Authorization', `Bearer ${token(other.id, other.phone)}`)
      .send({ imei: fixture.unit.imei, planType: 'full_protection', coverageMonths: 12 })
      .expect(403);
    const created = await request(app.getHttpServer())
      .post('/protection/policies')
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({ imei: fixture.unit.imei, planType: 'full_protection', coverageMonths: 12 })
      .expect(201);

    expect(created.body).toMatchObject({
      customerId: fixture.customer.id,
      imei: fixture.unit.imei,
      orderId: fixture.order.id,
      status: 'requested',
      deviceValue: 100_000,
      premium: 9_000,
    });
    const event = await prisma.auditEvent.findFirst({
      where: { type: 'protection.requested', refs: { has: created.body.id } },
    });
    expect(event?.actor).toBe(fixture.customer.id);
    expect(event?.payload).toMatchObject({ suggestedPremium: 9_000 });
  });

  it('splits staff read/update permissions and activates an accepted offer', async () => {
    const fixture = await soldDeviceFixture();
    const created = await request(app.getHttpServer())
      .post('/protection/policies')
      .set('Authorization', `Bearer ${fixture.token}`)
      .send({ imei: fixture.unit.imei, planType: 'accidental_damage', coverageMonths: 24 })
      .expect(201);

    await request(app.getHttpServer())
      .get('/protection/policies')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/protection/policies/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'reviewing' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/protection/policies/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'reviewing' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/protection/policies/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'offered', premium: 8_500, staffNote: 'Полное покрытие на 24 месяца' })
      .expect(200);
    const active = await request(app.getHttpServer())
      .patch(`/protection/policies/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${fixture.token}`)
      .expect(200);
    expect(active.body).toMatchObject({ status: 'active', premium: 8_500 });
    expect(new Date(active.body.endsAt).getTime()).toBeGreaterThan(new Date(active.body.startsAt).getTime());

    const events = await prisma.auditEvent.findMany({
      where: { type: 'protection.updated', refs: { has: created.body.id } },
      orderBy: { ts: 'asc' },
    });
    expect(events.map((event) => event.actor)).toEqual([adminId, adminId, fixture.customer.id]);
  });
});
