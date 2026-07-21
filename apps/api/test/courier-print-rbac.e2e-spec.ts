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
  let secondCourierToken: string;
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
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'cashier' | 'courier' | 'seller' | 'warehouse', suffix = '') => {
      const username = `${role}${suffix}-print-${RUN}`;
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
    secondCourierToken = (await createSession('courier', '-second')).token;

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
    await prisma.courierCommand.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  it('guards courier assignment and COD handover by role and staff actor', async () => {
    await request(app.getHttpServer())
      .post('/courier/runs')
      .send({ courierId, codTotal: 1000 })
      .expect(401);

    await request(app.getHttpServer())
      .post('/courier/runs')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ courierId, codTotal: 1000 })
      .expect(403);

    const run = await request(app.getHttpServer())
      .post('/courier/runs')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .set('Idempotency-Key', `assign-${RUN}`)
      .send({ courierId, codTotal: 1000 })
      .expect(201);

    const assigned = await prisma.auditEvent.findFirst({ where: { type: 'delivery.assigned' } });
    expect(assigned?.actor).toBe(warehouseId);

    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `seller-handover-${RUN}`)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(400);

    const handoverKey = `cashier-handover-${RUN}`;
    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${secondCourierToken}`)
      .set('Idempotency-Key', handoverKey)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('Idempotency-Key', handoverKey)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/courier/handover')
      .set('Authorization', `Bearer ${secondCourierToken}`)
      .set('Idempotency-Key', handoverKey)
      .send({ runId: run.body.id, amount: 1000 })
      .expect(403);

    const handover = await prisma.auditEvent.findFirst({ where: { type: 'cash.handover' } });
    expect(handover?.actor).toBe(cashierId);
  });

  it('guards failed-delivery recording by courier role and staff actor', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+9967011${RUN}`, name: 'Delivery RBAC' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        status: 'out_for_delivery',
        channel: 'web',
        fulfillmentType: 'courier',
        courierId,
        total: 1000,
      },
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${order.id}/fail`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `seller-fail-${RUN}`)
      .send({ reason: 'client unavailable' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/deliveries/${order.id}/fail`)
      .set('Authorization', `Bearer ${secondCourierToken}`)
      .set('Idempotency-Key', `foreign-courier-fail-${RUN}`)
      .send({ reason: 'client unavailable' })
      .expect(403);

    const mine = await request(app.getHttpServer())
      .get('/courier/me/deliveries')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);

    const foreign = await request(app.getHttpServer())
      .get('/courier/me/deliveries')
      .set('Authorization', `Bearer ${secondCourierToken}`)
      .expect(200);
    expect(foreign.body).toHaveLength(0);

    // Неуспешная доставка требует фото Evidence: без него курьер мог бы заявить
    // «клиента нет» и оставить COD себе (`deliveries.controller.ts` →
    // `assertCourierOrderEvidence`). Тест был написан до этого контроля и слал
    // отказ без фото, поэтому получал 422 — контроль работает, устарел тест.
    // Ослаблять его нельзя, поэтому здесь воспроизводится реальный порядок:
    // сначала загруженное фото, привязанное к курьеру и заказу, затем отказ.
    const evidenceKey = `courier-fail-evidence-${RUN}`;
    await prisma.evidenceUpload.create({
      data: {
        idempotencyKey: evidenceKey,
        actor: `staff:${courierId}`,
        entityType: 'order',
        entityId: order.id,
        label: 'Неуспешная доставка',
        fingerprint: `fp-${RUN}`,
        asset: { key: `evidence/${RUN}.jpg`, width: 1, height: 1, bytes: 1, contentType: 'image/jpeg' },
      },
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${order.id}/fail`)
      .set('Authorization', `Bearer ${courierToken}`)
      .set('Idempotency-Key', `courier-fail-${RUN}`)
      .send({ reason: 'client unavailable', evidenceIdempotencyKey: evidenceKey })
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

    // E8: the trade-in contract exposes the raw passport → restricted to PII-cleared
    // roles (admin/owner via pii:approve); a seller is now forbidden, not merely 422.
    await request(app.getHttpServer())
      .get('/documents/tradein/nope/contract')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/documents/order/nope/invoice')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/documents/order/nope/invoice')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(422);
  });
});
