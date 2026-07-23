import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsModule } from '../src/products/products.module';
import { RefundsModule } from '../src/refunds/refunds.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Dangerous product/refund endpoint RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let adminId: string;
  let cashierToken: string;
  let cashierId: string;
  let sellerToken: string;
  let ownerToken: string;
  let ownerId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);
  const previousSandboxConfirm = process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED;

  beforeAll(async () => {
    process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ProductsModule,
        PaymentsModule,
        RefundsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'cashier' | 'seller' | 'owner') => {
      const username = `${role}-danger-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminId = admin.id;
    adminToken = admin.token;

    const cashier = await createSession('cashier');
    cashierId = cashier.id;
    cashierToken = cashier.token;

    const seller = await createSession('seller');
    sellerToken = seller.token;

    const owner = await createSession('owner');
    ownerId = owner.id;
    ownerToken = owner.token;
  });

  afterAll(async () => {
    await app.close();
    if (previousSandboxConfirm === undefined) delete process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED;
    else process.env.PAYMENTS_SANDBOX_CONFIRM_ENABLED = previousSandboxConfirm;
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function product(price = 100000) {
    return prisma.product.create({
      data: {
        sku: `DANGER-${RUN}-${Math.random()}`,
        name: 'iPhone',
        price,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
  }

  async function paymentFixture(amount = 100000) {
    const customer = await prisma.customer.create({
      data: { phone: `+996702${RUN}`, name: 'Refund RBAC' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id, status: 'paid', channel: 'pos', total: amount,
        items: { create: { sku: `REFUND-RBAC-${RUN}`, qty: 1, price: amount } },
      },
      include: { items: true },
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount, method: 'cash', status: 'received', point: 'BISHKEK-1' },
    });
    const shift = await prisma.cashShift.create({ data: { staffId: cashierId, point: 'BISHKEK-1', openCash: amount } });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id, reason: 'RBAC return', status: 'processing', refundAmount: 10000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 10000 } },
      },
    });
    return { payment, shift, ret };
  }

  it('guards product price changes and records actor from the staff JWT', async () => {
    const p = await product();

    await request(app.getHttpServer())
      .patch(`/products/${p.id}/price`)
      .send({ price: 110000, reason: 'supplier cost', requester: 'spoof' })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/products/${p.id}/price`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ price: 110000, reason: 'supplier cost', requester: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/products/${p.id}/price`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 110000, reason: 'supplier cost', requester: 'spoof' })
      .expect(200);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'price.changed' } });
    expect(event?.actor).toBe(adminId);
  });

  it('guards product archive requests and records requester from the staff JWT', async () => {
    const p = await product();

    await request(app.getHttpServer())
      .delete(`/products/${p.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ reason: 'legacy sku', requester: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/products/${p.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'legacy sku', requester: 'spoof' })
      .expect(202);

    const approval = await prisma.approval.findFirst({ where: { action: 'delete' } });
    expect(approval?.requester).toBe(ownerId);
  });

  it('guards refund requests while preserving public payment intent/webhook flow', async () => {
    const fixture = await paymentFixture();

    await request(app.getHttpServer())
      .post(`/payments/${fixture.payment.id}/refund`)
      .send({ amount: 10000, reason: 'return', requester: 'spoof' })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/payments/${fixture.payment.id}/refund`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ amount: 10000, reason: 'return', requester: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/payments/${fixture.payment.id}/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('Idempotency-Key', `refund-rbac-${RUN}`)
      .send({ amount: 10000, reason: 'return', requester: 'spoof', returnId: fixture.ret.id, shiftId: fixture.shift.id })
      .expect(202);

    const approval = await prisma.approval.findFirst({ where: { action: 'refund' } });
    expect(approval?.requester).toBe(cashierId);

    await request(app.getHttpServer())
      .post('/payments/webhooks/sandbox')
      .send({
        orderId: 'missing',
        method: 'card',
        amount: 1000,
        txnId: `txn-${RUN}`,
        status: 'succeeded',
      })
      // Unsigned callbacks are deliberately indistinguishable from a missing
      // webhook route. A signed unknown-order callback is covered by the
      // payment-intents integration suite and reaches the domain 422 branch.
      .expect(404);
  });

  it('allows authorized finance roles to read refund drilldown only', async () => {
    const fixture = await paymentFixture();
    const created = await request(app.getHttpServer())
      .post(`/returns/${fixture.ret.id}/refunds`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('Idempotency-Key', `aggregate-rbac-${RUN}`)
      .send({ reason: 'authorized aggregate read', shiftId: fixture.shift.id })
      .expect(202);

    await request(app.getHttpServer())
      .get(`/refunds/${created.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/refunds/${created.body.id}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/refunds/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/refunds/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `cancel-rbac-seller-${RUN}`)
      .send({ reason: 'must be denied' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/refunds/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `cancel-rbac-admin-${RUN}`)
      .send({ reason: 'allowed role reaches domain guard' })
      .expect(409);
  });
});
