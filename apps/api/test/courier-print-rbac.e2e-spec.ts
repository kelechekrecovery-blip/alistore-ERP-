import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { CourierModule } from '../src/courier/courier.module';
import { DocumentsModule } from '../src/documents/documents.module';
import { LabelsModule } from '../src/labels/labels.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReceiptsModule } from '../src/receipts/receipts.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Courier and print/export RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let cashierToken: string;
  let cashierId: string;
  let courierToken: string;
  let courierId: string;
  let sellerToken: string;
  let warehouseToken: string;
  let warehouseId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        CourierModule,
        LabelsModule,
        ReceiptsModule,
        DocumentsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'cashier' | 'courier' | 'seller' | 'warehouse') => {
      const username = `${role}-print-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const cashier = await createSession('cashier');
    cashierId = cashier.id;
    cashierToken = cashier.token;

    const courier = await createSession('courier');
    courierId = courier.id;
    courierToken = courier.token;

    const seller = await createSession('seller');
    sellerToken = seller.token;

    const warehouse = await createSession('warehouse');
    warehouseId = warehouse.id;
    warehouseToken = warehouse.token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.customer.deleteMany();
  });

  it('guards courier assignment and COD handover by role and staff actor', async () => {
    await request(app.getHttpServer())
      .post('/courier/runs')
      .send({ courierId: `courier-${RUN}`, codTotal: 1000 })
      .expect(401);

    await request(app.getHttpServer())
      .post('/courier/runs')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ courierId: `courier-${RUN}`, codTotal: 1000 })
      .expect(403);

    const run = await request(app.getHttpServer())
      .post('/courier/runs')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ courierId: `courier-${RUN}`, codTotal: 1000 })
      .expect(201);

    const assigned = await prisma.auditEvent.findFirst({ where: { type: 'delivery.assigned' } });
    expect(assigned?.actor).toBe(warehouseId);

    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(201);

    const handover = await prisma.auditEvent.findFirst({ where: { type: 'cash.handover' } });
    expect(handover?.actor).toBe(cashierId);
  });

  it('guards failed-delivery recording by courier role and staff actor', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+9967011${RUN}`, name: 'Delivery RBAC' },
    });
    const order = await prisma.order.create({
      data: { customerId: customer.id, status: 'out_for_delivery', channel: 'web', total: 1000 },
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${order.id}/fail`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ reason: 'client unavailable' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/deliveries/${order.id}/fail`)
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ reason: 'client unavailable' })
      .expect(201);

    const failed = await prisma.auditEvent.findFirst({ where: { type: 'delivery.failed' } });
    expect(failed?.actor).toBe(courierId);
  });

  it('guards label, receipt, and document rendering with staff role permissions', async () => {
    await request(app.getHttpServer())
      .post('/labels/imei')
      .send({ imei: '353915090123456' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/labels/imei')
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ imei: '353915090123456' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/labels/imei')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ imei: '353915090123456' })
      .expect(201);

    const receiptPayload = {
      store: { name: 'AliStore' },
      orderId: `order-${RUN}`,
      issuedAt: new Date().toISOString(),
      items: [{ name: 'iPhone', qty: 1, price: 1000 }],
      total: 1000,
      payment: 'cash',
      cashier: 'cashier',
    };

    await request(app.getHttpServer())
      .post('/receipts/render')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(receiptPayload)
      .expect(403);

    await request(app.getHttpServer())
      .post('/receipts/render')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(receiptPayload)
      .expect(201);

    await request(app.getHttpServer())
      .get('/documents/tradein/nope/contract')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/documents/tradein/nope/contract')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(422);
  });
});
