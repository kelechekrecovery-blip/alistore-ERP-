import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { TradeInsModule } from '../src/tradeins/tradeins.module';
import { issueGuestCheckoutCapability } from '../src/auth/guest-capability';
import { JwtStrategy } from '../src/auth/jwt.strategy';

describe('Trade-in self-service and staff intake RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let sellerToken: string;
  let sellerId: string;
  let warehouseToken: string;
  let jwt: JwtService;
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        TradeInsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    jwt = moduleRef.get(JwtService);

    const createSession = async (role: 'seller' | 'warehouse') => {
      const username = `${role}-tradein-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const seller = await createSession('seller');
    sellerId = seller.id;
    sellerToken = seller.token;
    warehouseToken = (await createSession('warehouse')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cashDrawerMovement.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.customer.deleteMany();
    // Приёмка у прилавка выдаёт наличные из ящика (`shifts/cash-drawer.ts`),
    // поэтому у принимающего нужна открытая смена. Спек написан до этого
    // контроля; создаём смену после собственной очистки спека, которая сносит
    // все смены.
    await prisma.cashShift.create({
      data: { staffId: sellerId, point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
  });

  async function customerFixture() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+996706${RUN}${seq}`, name: 'Trade-in RBAC' },
    });
  }

  function payload(customerId: string, imei?: string) {
    return {
      customerId,
      model: 'iPhone 13 Pro 256GB',
      ...(imei ? { imei } : {}),
      grade: 'B',
      price: 42000,
      sellerPassport: 'ID1234567',
    };
  }

  function customerToken(customerId: string) {
    return jwt.sign({ sub: customerId, typ: 'customer' });
  }

  it('keeps customer self-service public but guards staff intake/read and actors', async () => {
    const customer = await customerFixture();

    const publicTradeIn = await request(app.getHttpServer())
      .post('/tradeins')
      .set('x-guest-capability', issueGuestCheckoutCapability(customer.id))
      .set('Idempotency-Key', `guest-${RUN}-1`)
      .send(payload(customer.id))
      .expect(201);

    const otherCustomer = await customerFixture();
    await request(app.getHttpServer())
      .post('/tradeins')
      .set('x-guest-capability', issueGuestCheckoutCapability(otherCustomer.id))
      .set('Idempotency-Key', `guest-${RUN}-2`)
      .send(payload(customer.id))
      .expect(403);

    expect(publicTradeIn.body.sellerPassportMasked).toBe('ID1***67');
    const publicEvent = await prisma.auditEvent.findFirst({ where: { type: 'tradein.assessed' } });
    expect(publicEvent?.actor).toBe(customer.id);

    await request(app.getHttpServer())
      .get(`/tradeins/${publicTradeIn.body.id}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/tradeins/${publicTradeIn.body.id}`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/tradeins/${publicTradeIn.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    await prisma.auditEvent.deleteMany();
    const intakeCustomer = await customerFixture();

    await request(app.getHttpServer())
      .post('/tradeins/intake')
      .send(payload(intakeCustomer.id))
      .expect(401);
    await request(app.getHttpServer())
      .post('/tradeins/intake')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .set('Idempotency-Key', `warehouse-${RUN}-1`)
      .send(payload(intakeCustomer.id))
      .expect(403);

    const intakeImei = `TI-RBAC-${RUN}-${seq}`;
    await request(app.getHttpServer())
      .post('/tradeins/intake')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `seller-${RUN}-1`)
      .send(payload(intakeCustomer.id, intakeImei))
      .expect(201)
      .expect((res) => {
        expect(res.body.imei).toBe(intakeImei);
      });

    const staffEvent = await prisma.auditEvent.findFirst({ where: { type: 'tradein.contracted' } });
    expect(staffEvent?.actor).toBe(sellerId);
    expect(staffEvent?.refs).toContain(intakeImei);
    const saved = await prisma.tradeInDevice.findFirst({ where: { imei: intakeImei } });
    expect(saved?.customerId).toBe(intakeCustomer.id);
  });

  it('derives the owner from customer JWT and exposes only owned records', async () => {
    const owner = await customerFixture();
    const other = await customerFixture();
    const response = await request(app.getHttpServer())
      .post('/tradeins')
      .set('Authorization', `Bearer ${customerToken(owner.id)}`)
      .set('Idempotency-Key', `customer-${RUN}-1`)
      .send(payload(other.id))
      .expect(201);

    expect(response.body.customerId).toBe(owner.id);
    const event = await prisma.auditEvent.findFirst({ where: { type: 'tradein.assessed' } });
    expect(event?.actor).toBe(owner.id);

    await request(app.getHttpServer())
      .get('/tradeins/mine')
      .set('Authorization', `Bearer ${customerToken(owner.id)}`)
      .expect(200)
      .expect((res) => expect(res.body.map((item: { id: string }) => item.id)).toContain(response.body.id));

    await request(app.getHttpServer())
      .get(`/tradeins/mine/${response.body.id}`)
      .set('Authorization', `Bearer ${customerToken(other.id)}`)
      .expect(404);
  });
});
