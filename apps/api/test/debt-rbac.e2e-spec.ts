import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { DEBT_LIMIT } from '../src/debts/debts.service';
import { DebtsModule } from '../src/debts/debts.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Debt RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let cashierToken: string;
  let cashierId: string;
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
        DebtsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'cashier' | 'seller' | 'warehouse') => {
      const username = `${role}-debt-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const cashier = await createSession('cashier');
    cashierId = cashier.id;
    cashierToken = cashier.token;

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
    await prisma.debtPlan.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.quantityConsignmentAllocation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
  });

  async function orderFixture(total = 100000) {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+996705${RUN}${seq}`, name: 'Debt RBAC' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'pos', total, status: 'paid' },
    });
    return order.id;
  }

  it('guards debt create/list/pay and records actors from staff JWT', async () => {
    const orderId = await orderFixture();

    await request(app.getHttpServer())
      .post('/debts')
      .send({ orderId, principal: 20000, actor: 'spoof' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/debts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ orderId, principal: 20000, actor: 'spoof' })
      .expect(403);

    const debt = await request(app.getHttpServer())
      .post('/debts')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ orderId, principal: 20000, actor: 'spoof' })
      .expect(201);

    const created = await prisma.auditEvent.findFirst({ where: { type: 'debt.created' } });
    expect(created?.actor).toBe(sellerId);

    await request(app.getHttpServer()).get('/debts').expect(401);
    await request(app.getHttpServer())
      .get('/debts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/debts')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/debts/${debt.body.id}/payments`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ amount: 5000, actor: 'spoof' })
      .expect(403);

    // Наличное погашение требует открытой смены: без неё деньги попадают в
    // ящик, о котором система не знает.
    await prisma.cashShift.create({
      data: { staffId: cashierId, point: 'BISHKEK-1', openCash: 0, openedAt: new Date() },
    });
    await request(app.getHttpServer())
      .post(`/debts/${debt.body.id}/payments`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 5000, actor: 'spoof', method: 'cash' })
      .expect(201);

    const paid = await prisma.auditEvent.findFirst({ where: { type: 'debt.payment' } });
    expect(paid?.actor).toBe(cashierId);

    const approvalOrderId = await orderFixture(200000);
    await request(app.getHttpServer())
      .post('/debts')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ orderId: approvalOrderId, principal: DEBT_LIMIT + 25000, actor: 'spoof' })
      .expect(201);

    const approval = await prisma.approval.findFirst({ where: { action: 'debt' } });
    expect(approval?.requester).toBe(sellerId);
  });
});
