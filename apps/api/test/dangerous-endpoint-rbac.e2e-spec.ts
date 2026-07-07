import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsModule } from '../src/products/products.module';
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ProductsModule,
        PaymentsModule,
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
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
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
      data: { customerId: customer.id, status: 'paid', channel: 'pos', total: amount },
    });
    return prisma.payment.create({
      data: { orderId: order.id, amount, method: 'cash', status: 'received' },
    });
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
    const payment = await paymentFixture();

    await request(app.getHttpServer())
      .post(`/payments/${payment.id}/refund`)
      .send({ amount: 10000, reason: 'return', requester: 'spoof' })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ amount: 10000, reason: 'return', requester: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: 10000, reason: 'return', requester: 'spoof' })
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
      .expect(422);
  });
});
