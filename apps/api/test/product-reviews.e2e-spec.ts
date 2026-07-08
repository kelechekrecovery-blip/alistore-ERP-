import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsModule } from '../src/products/products.module';

describe('Product reviews', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
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

  it('publishes a review only after purchase and exposes the rating summary', async () => {
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
      });

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
  });
});
