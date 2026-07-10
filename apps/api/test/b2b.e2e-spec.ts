import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { B2BModule } from '../src/b2b/b2b.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('B2B wholesale quotes', () => {
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
        B2BModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    staffAuth = moduleRef.get(StaffAuthService);

    const seller = await staffAuth.createStaff(`b2b-seller-${RUN}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(seller.username, 'pass')).accessToken;
    const admin = await staffAuth.createStaff(`b2b-admin-${RUN}`, 'pass', 'admin');
    adminId = admin.id;
    adminToken = (await staffAuth.login(admin.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.b2BQuote.deleteMany({ where: { customerId: { startsWith: `b2b-${RUN}` } } });
    await prisma.businessBuyerProfile.deleteMany({ where: { customerId: { startsWith: `b2b-${RUN}` } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `B2B-${RUN}` } } });
    await prisma.staffUser.deleteMany({ where: { username: { contains: `-${RUN}` } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.b2BQuote.deleteMany();
    await prisma.businessBuyerProfile.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { type: { startsWith: 'b2b.' } } });
  });

  async function customerFixture() {
    seq += 1;
    const customer = await prisma.customer.create({
      data: {
        id: `b2b-${RUN}-${seq}`,
        phone: `+99673${String(RUN).padStart(6, '0').slice(0, 6)}${String(seq).padStart(2, '0')}`,
        name: `Buyer ${seq}`,
      },
    });
    return {
      customer,
      token: jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone }),
    };
  }

  async function productFixture() {
    seq += 1;
    return prisma.product.create({
      data: {
        sku: `B2B-${RUN}-${seq}`,
        name: 'iPhone для корпоративного парка',
        price: 100_000,
        cost: 80_000,
        category: 'phones',
        attrs: {},
      },
    });
  }

  async function profileAndQuote() {
    const buyer = await customerFixture();
    const product = await productFixture();
    await request(app.getHttpServer())
      .put('/b2b/profile')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        companyName: 'ОсОО Корпоративный парк',
        taxId: '12345678901234',
        contactName: 'Айбек Садыков',
        email: 'buyer@example.kg',
        billingAddress: 'Бишкек, Киевская 95',
      })
      .expect(200);
    const response = await request(app.getHttpServer())
      .post('/b2b/quotes')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        paymentIntent: 'invoice',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Бишкек, Киевская 95',
        comment: 'Поставка в этом месяце',
        items: [{ sku: product.sku, qty: 10, targetPrice: 90_000 }],
      })
      .expect(201);
    return { ...buyer, product, quote: response.body };
  }

  it('creates a customer-owned invoice request using trusted catalog prices and ledger actor', async () => {
    const buyer = await customerFixture();
    const other = await customerFixture();
    const product = await productFixture();

    await request(app.getHttpServer()).put('/b2b/profile').send({}).expect(401);
    await request(app.getHttpServer())
      .put('/b2b/profile')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        companyName: 'ОсОО Ali Business',
        taxId: '12345678901234',
        contactName: 'Алина',
        billingAddress: 'Бишкек, Манаса 1',
      })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/b2b/quotes')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        paymentIntent: 'invoice',
        fulfillmentType: 'delivery',
        deliveryAddress: 'Бишкек, Манаса 1',
        items: [{ sku: product.sku, qty: 5, targetPrice: 1 }],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      customerId: buyer.customer.id,
      status: 'requested',
      paymentIntent: 'invoice',
      listTotal: 500_000,
    });
    expect(created.body.items[0]).toMatchObject({
      sku: product.sku,
      qty: 5,
      listPrice: 100_000,
      targetPrice: 1,
    });

    const mine = await request(app.getHttpServer())
      .get('/b2b/quotes/mine')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    await request(app.getHttpServer())
      .patch(`/b2b/quotes/${created.body.id}/accept`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);

    const event = await prisma.auditEvent.findFirst({
      where: { type: 'b2b.quote_requested', refs: { has: created.body.id } },
    });
    expect(event?.actor).toBe(buyer.customer.id);
    expect(event?.payload).toMatchObject({ listTotal: 500_000, paymentIntent: 'invoice' });
  });

  it('exposes the queue to sales staff but reserves quote decisions for senior staff', async () => {
    const { quote, token: buyerToken } = await profileAndQuote();

    await request(app.getHttpServer()).get('/b2b/quotes').expect(401);
    const queue = await request(app.getHttpServer())
      .get('/b2b/quotes')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    expect(queue.body[0].profile.companyName).toBe('ОсОО Корпоративный парк');

    await request(app.getHttpServer())
      .patch(`/b2b/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'reviewing' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/b2b/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'reviewing', staffNote: 'Проверяем остаток' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/b2b/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'quoted',
        quotedTotal: 900_000,
        validUntil: '2026-08-01T00:00:00.000Z',
      })
      .expect(200);
    const accepted = await request(app.getHttpServer())
      .patch(`/b2b/quotes/${quote.id}/accept`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(accepted.body.status).toBe('accepted');

    const events = await prisma.auditEvent.findMany({
      where: { type: 'b2b.quote_updated', refs: { has: quote.id } },
      orderBy: { ts: 'asc' },
    });
    expect(events.map((event) => event.actor)).toEqual([adminId, adminId, quote.customerId]);
    expect(events.map((event) => (event.payload as { to: string }).to)).toEqual([
      'reviewing',
      'quoted',
      'accepted',
    ]);
  });
});
