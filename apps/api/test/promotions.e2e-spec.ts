import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { OrdersModule } from '../src/orders/orders.module';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PromotionsModule } from '../src/promotions/promotions.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Managed promotion codes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let marketerToken: string;
  let sellerToken: string;
  const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, PromotionsModule, OrdersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrdersService);
    const auth = moduleRef.get(StaffAuthService);
    const marketer = await auth.createStaff(`promo-marketer-${run}`, 'pass', 'marketer');
    marketerToken = (await auth.login(marketer.username, 'pass')).accessToken;
    const seller = await auth.createStaff(`promo-seller-${run}`, 'pass', 'seller');
    sellerToken = (await auth.login(seller.username, 'pass')).accessToken;
  });

  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    const promoOrders = await prisma.order.findMany({
      where: { idempotencyKey: { startsWith: `promo-${run}` } },
      select: { id: true },
    });
    const promoOrderIds = promoOrders.map((order) => order.id);
    await prisma.reservation.deleteMany({ where: { orderId: { in: promoOrderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: promoOrderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: promoOrderIds } } });
    await prisma.order.deleteMany({ where: { idempotencyKey: { startsWith: `promo-${run}` } } });
    await prisma.promotionRedemption.deleteMany({ where: { promotion: { code: { startsWith: `PROMO${run.replace(/\D/g, '').slice(-8)}` } } } });
    await prisma.promotionCode.deleteMany({ where: { code: { startsWith: `PROMO${run.replace(/\D/g, '').slice(-8)}` } } });
    await prisma.deviceUnit.deleteMany({ where: { imei: { startsWith: `PROMO-${run}` } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `PROMO-${run}` } } });
    await prisma.storePoint.deleteMany({ where: { code: { startsWith: `PROMO-${run}` } } });
    await prisma.customer.deleteMany({ where: { name: { startsWith: `Promo Buyer ${run}` } } });
  });

  async function fixture() {
    const point = await prisma.storePoint.create({
      data: { code: `PROMO-${run}-${Date.now()}`, name: 'Promo point', address: 'Bishkek', inventoryLocation: `PROMO-${run}-LOC`, hours: '10:00-20:00', active: true, createdBy: 'test', idempotencyKey: `promo-point-${run}-${Date.now()}` },
    });
    const product = await prisma.product.create({
      data: { sku: `PROMO-${run}-${Date.now()}`, name: 'Eligible phone', price: 10000, cost: 7000, category: 'phones', attrs: {} },
    });
    await prisma.deviceUnit.createMany({ data: [
      { imei: `PROMO-${run}-${Date.now()}-1`, productId: product.id, status: 'in_stock', location: point.inventoryLocation },
      { imei: `PROMO-${run}-${Date.now()}-2`, productId: product.id, status: 'in_stock', location: point.inventoryLocation },
    ] });
    return { point, product };
  }

  function body(code: string, productId: string) {
    return {
      code,
      name: 'Launch offer',
      description: 'Managed in ERP',
      discountType: 'fixed',
      discountValue: 3000,
      minimumSubtotal: 5000,
      eligibleProductIds: [productId],
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      totalLimit: 1,
      perCustomerLimit: 1,
    };
  }

  it('enforces RBAC and lifecycle, quotes canonical prices and records management events', async () => {
    const { product } = await fixture();
    const code = `PROMO${run.replace(/\D/g, '').slice(-8)}A`;
    await request(app.getHttpServer()).post('/promotions').set('Authorization', `Bearer ${sellerToken}`).send(body(code, product.id)).expect(403);
    const created = await request(app.getHttpServer()).post('/promotions').set('Authorization', `Bearer ${marketerToken}`).send(body(code, product.id)).expect(201);
    expect(created.body).toMatchObject({ code, status: 'draft', effectiveStatus: 'draft' });
    const inactive = await request(app.getHttpServer()).post('/promotions/quote').send({ code, items: [{ sku: product.sku, qty: 1 }] }).expect(422);
    expect(inactive.body.code).toBe('promo_not_active');

    await request(app.getHttpServer()).post(`/promotions/${created.body.id}/activate`).set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    const quote = await request(app.getHttpServer()).post('/promotions/quote').send({ code: code.toLowerCase(), items: [{ sku: product.sku, qty: 1 }] }).expect(201);
    expect(quote.body).toMatchObject({ code, subtotal: 10000, eligibleSubtotal: 10000, discount: 3000, customerLimitVerified: false });
    const activeEdit = await request(app.getHttpServer()).post(`/promotions/${created.body.id}/update`).set('Authorization', `Bearer ${marketerToken}`).send({ name: 'Changed live' }).expect(409);
    expect(activeEdit.body.code).toBe('promotion_active_edit_forbidden');
    await request(app.getHttpServer()).post(`/promotions/${created.body.id}/pause`).set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);

    const list = await request(app.getHttpServer()).get('/promotions').set('Authorization', `Bearer ${marketerToken}`).expect(200);
    expect(list.body).toContainEqual(expect.objectContaining({ id: created.body.id, effectiveStatus: 'paused', redemptionCount: 0 }));
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } }, orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual(['promotion.created', 'promotion.activated', 'promotion.paused']);
  });

  it('atomically applies the last allowed redemption and keeps order replay idempotent', async () => {
    const { point, product } = await fixture();
    const code = `PROMO${run.replace(/\D/g, '').slice(-8)}B`;
    const created = await request(app.getHttpServer()).post('/promotions').set('Authorization', `Bearer ${marketerToken}`).send(body(code, product.id)).expect(201);
    await request(app.getHttpServer()).post(`/promotions/${created.body.id}/activate`).set('Authorization', `Bearer ${marketerToken}`).send({}).expect(201);
    const customers = await Promise.all([
      prisma.customer.create({ data: { phone: `+996711${Date.now().toString().slice(-6)}`, name: `Promo Buyer ${run} A` } }),
      prisma.customer.create({ data: { phone: `+996711${(Date.now() + 1).toString().slice(-6)}`, name: `Promo Buyer ${run} B` } }),
    ]);
    const create = (customerId: string, key: string) => orders.createFromCatalog({
      customerId,
      channel: 'web',
      fulfillmentType: 'pickup',
      storePointId: point.id,
      total: 1,
      promoCode: code.toLowerCase(),
      items: [{ sku: product.sku, qty: 1, price: 1 }],
    }, customerId, key, true);

    const attempts = await Promise.allSettled([
      create(customers[0].id, `promo-${run}-order-a`),
      create(customers[1].id, `promo-${run}-order-b`),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winner = attempts.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof create>>> => result.status === 'fulfilled')!.value;
    expect(winner).toMatchObject({ subtotal: 10000, promoCode: code, promoDiscount: 3000, total: 7000 });
    const replay = await create(winner.customerId, winner.idempotencyKey!);
    expect(replay.id).toBe(winner.id);
    expect(await prisma.promotionRedemption.count({ where: { promotionId: created.body.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'promotion.redeemed', refs: { has: winner.id } } })).toBe(1);
  });
});
