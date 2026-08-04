import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsModule } from '../src/products/products.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Product reviews', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let marketerToken: string;
  let sellerToken: string;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' });
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        ProductsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const staffAuth = moduleRef.get(StaffAuthService);
    const marketer = await staffAuth.createStaff(`review-marketer-${RUN}`, 'pass', 'marketer');
    marketerToken = (await staffAuth.login(marketer.username, 'pass')).accessToken;
    const seller = await staffAuth.createStaff(`review-seller-${RUN}`, 'pass', 'seller');
    sellerToken = (await staffAuth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { type: { in: ['product_review.submitted', 'product_review.approved', 'product_review.rejected'] } } });
    await prisma.productReview.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  function customerToken(customer: { id: string; phone: string }) {
    return jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });
  }

  async function fixture(status: 'created' | 'paid' | 'completed' = 'paid') {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+996711${RUN}${seq}`, name: 'Review Customer' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `REV-${RUN}-${seq}`,
        name: 'Review Phone',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        total: product.price,
        status,
        items: { create: [{ sku: product.sku, qty: 1, price: product.price }] },
      },
    });
    return { customer, product, order };
  }

  it('publishes a purchased review only after marketer moderation', async () => {
    const pending = await fixture('created');
    await request(app.getHttpServer())
      .post(`/products/${pending.product.id}/reviews`)
      .set('Authorization', `Bearer ${customerToken(pending.customer)}`)
      .send({ rating: 5, text: 'too early' })
      .expect(403);

    const { customer, product } = await fixture('paid');
    await request(app.getHttpServer()).get(`/products/${product.id}/reviews`).expect(200).expect((res) => {
      expect(res.body.count).toBe(0);
      expect(res.body.avgRating).toBeNull();
    });

    await request(app.getHttpServer())
      .post(`/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${customerToken(customer)}`)
      .send({ rating: 5, text: 'Быстро доставили' })
      .expect(201)
      .expect((res) => {
        expect(res.body.rating).toBe(5);
        expect(res.body.text).toBe('Быстро доставили');
        expect(res.body.customerName).toBe('Review Customer');
        expect(res.body.status).toBe('pending');
      });

    await request(app.getHttpServer()).get(`/products/${product.id}/reviews`).expect(200).expect((res) => {
      expect(res.body.count).toBe(0);
      expect(res.body.avgRating).toBeNull();
    });

    const queue = await request(app.getHttpServer()).get('/products/reviews/moderation?status=pending').set('Authorization', `Bearer ${marketerToken}`).expect(200);
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({ productName: 'Review Phone', text: 'Быстро доставили', status: 'pending' });
    await request(app.getHttpServer()).post(`/products/reviews/${queue.body.items[0].id}/moderate`).set('Authorization', `Bearer ${sellerToken}`).send({ action: 'approve' }).expect(403);
    await request(app.getHttpServer()).post(`/products/reviews/${queue.body.items[0].id}/moderate`).set('Authorization', `Bearer ${marketerToken}`).send({ action: 'approve' }).expect(201);
    await request(app.getHttpServer()).post(`/products/reviews/${queue.body.items[0].id}/moderate`).set('Authorization', `Bearer ${marketerToken}`).send({ action: 'approve' }).expect(201);

    await request(app.getHttpServer()).get(`/products/${product.id}/reviews`).expect(200).expect((res) => {
      expect(res.body.count).toBe(1);
      expect(res.body.avgRating).toBe(5);
      expect(res.body.items[0]).toMatchObject({ rating: 5, text: 'Быстро доставили' });
    });

    await request(app.getHttpServer())
      .post(`/products/${product.id}/reviews`)
      .set('Authorization', `Bearer ${customerToken(customer)}`)
      .send({ rating: 4 })
      .expect(409);

    const events = await prisma.auditEvent.findMany({ where: { refs: { has: queue.body.items[0].id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['product_review.submitted', 'product_review.approved']);
  });

  it('requires a rejection reason and keeps rejected reviews private', async () => {
    const { customer, product } = await fixture('completed');
    const created = await request(app.getHttpServer()).post(`/products/${product.id}/reviews`).set('Authorization', `Bearer ${customerToken(customer)}`).send({ rating: 1, text: 'Внешняя ссылка' }).expect(201);
    await request(app.getHttpServer()).post(`/products/reviews/${created.body.id}/moderate`).set('Authorization', `Bearer ${marketerToken}`).send({ action: 'reject' }).expect(422);
    await request(app.getHttpServer()).post(`/products/reviews/${created.body.id}/moderate`).set('Authorization', `Bearer ${marketerToken}`).send({ action: 'reject', reason: 'Спам' }).expect(201);
    const publicReviews = await request(app.getHttpServer()).get(`/products/${product.id}/reviews`).expect(200);
    expect(publicReviews.body).toMatchObject({ count: 0, avgRating: null, items: [] });
    const rejected = await request(app.getHttpServer()).get('/products/reviews/moderation?status=rejected').set('Authorization', `Bearer ${marketerToken}`).expect(200);
    expect(rejected.body.items[0]).toMatchObject({ id: created.body.id, status: 'rejected', moderationReason: 'Спам' });
  });
});
