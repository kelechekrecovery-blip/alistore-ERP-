import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AiModule } from '../src/ai/ai.module';
import { AuditModule } from '../src/audit/audit.module';
import { OrdersModule } from '../src/orders/orders.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsModule } from '../src/reports/reports.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Reports and AI RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' });
  const RUN = Math.floor(Math.random() * 1_000_000);
  let adminToken: string;
  let ownerToken: string;
  let sellerToken: string;
  let warehouseToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ReportsModule,
        AiModule,
        OrdersModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'owner' | 'seller' | 'warehouse') => {
      const username = `${role}-reports-ai-${RUN}`;
      await staffAuth.createStaff(username, 'pass', role);
      return (await staffAuth.login(username, 'pass')).accessToken;
    };

    adminToken = await createSession('admin');
    ownerToken = await createSession('owner');
    sellerToken = await createSession('seller');
    warehouseToken = await createSession('warehouse');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  function customerToken(customer: { id: string; phone: string }) {
    return jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });
  }

  it('guards owner reports and AI endpoints behind owner/admin staff permissions', async () => {
    await request(app.getHttpServer()).get('/reports/dashboard').expect(401);
    await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer()).get('/ai/insights').expect(401);
    await request(app.getHttpServer())
      .get('/ai/insights')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/ai/insights')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/ai/categorize')
      .send({ name: 'iPhone 15 128GB' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ai/categorize')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'iPhone 15 128GB' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ai/grade-photos')
      .send({ photos: [{ label: 'front' }] })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ai/grade-photos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ photos: [{ label: 'front' }, { label: 'back' }, { label: 'screen-on' }] })
      .expect(201)
      .expect((res) => {
        expect(res.body.source).toBe('rules');
        expect(res.body.grade).toBe('A');
      });

    await request(app.getHttpServer())
      .post('/ai/price-scout')
      .send({ name: 'iPhone 15', basePrice: 109900 })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ai/price-scout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'iPhone 15', basePrice: 109900, observedListings: [{ price: 101000 }, { price: 103000 }] })
      .expect(201)
      .expect((res) => {
        expect(res.body.source).toBe('rules');
        expect(res.body.recommendedPrice).toBeGreaterThan(0);
      });
  });

  it('keeps order timeline ledger scoped to the owning customer or staff queue readers', async () => {
    const owner = await prisma.customer.create({
      data: { phone: `+996700${RUN}11`, name: 'Ledger Owner' },
    });
    const other = await prisma.customer.create({
      data: { phone: `+996700${RUN}12`, name: 'Ledger Other' },
    });
    const order = await prisma.order.create({
      data: { customerId: owner.id, channel: 'web', total: 1000, status: 'created' },
    });
    await prisma.auditEvent.create({
      data: {
        type: 'order.created',
        actor: 'system',
        payload: { orderId: order.id },
        refs: [order.id],
      },
    });

    await request(app.getHttpServer()).get(`/orders/${order.id}/ledger`).expect(401);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${customerToken(other)}`)
      .expect(404);

    const customerRes = await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${customerToken(owner)}`)
      .expect(200);
    expect(customerRes.body).toHaveLength(1);
    expect(customerRes.body[0].type).toBe('order.created');

    await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}/ledger`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);
  });
});
