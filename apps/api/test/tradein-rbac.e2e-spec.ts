import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { TradeInsModule } from '../src/tradeins/tradeins.module';

describe('Trade-in self-service and staff intake RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let sellerToken: string;
  let sellerId: string;
  let warehouseToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        TradeInsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

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
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.debtPlan.deleteMany();
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
  });

  async function customerFixture() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+996706${RUN}${seq}`, name: 'Trade-in RBAC' },
    });
  }

  function payload(customerId: string) {
    return {
      customerId,
      model: 'iPhone 13 Pro 256GB',
      grade: 'B',
      price: 42000,
      sellerPassport: 'ID1234567',
      actor: 'spoof',
    };
  }

  it('keeps customer self-service public but guards staff intake/read and actors', async () => {
    const customer = await customerFixture();

    const publicTradeIn = await request(app.getHttpServer())
      .post('/tradeins')
      .send(payload(customer.id))
      .expect(201);

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
      .send(payload(intakeCustomer.id))
      .expect(403);

    await request(app.getHttpServer())
      .post('/tradeins/intake')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(payload(intakeCustomer.id))
      .expect(201);

    const staffEvent = await prisma.auditEvent.findFirst({ where: { type: 'tradein.contracted' } });
    expect(staffEvent?.actor).toBe(sellerId);
  });
});
