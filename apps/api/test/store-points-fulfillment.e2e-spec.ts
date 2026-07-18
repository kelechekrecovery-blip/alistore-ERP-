import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { LogisticsModule } from '../src/logistics/logistics.module';
import { OrdersModule } from '../src/orders/orders.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Store point fulfillment contract', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const pointCode = `ful-${run}`;
  const location = `FUL-${run}`.toUpperCase();
  const orderIds: string[] = [];
  const productIds: string[] = [];
  let pointId = '';
  let staffId = '';
  let customerId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, LogisticsModule, OrdersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const staff = await auth.createStaff(`owner-${pointCode}`, 'pass', 'owner');
    staffId = staff.id;
    ownerToken = (await auth.login(staff.username, 'pass')).accessToken;
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderQuantityAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderBundleAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    if (pointId) {
      await prisma.storePointCommand.deleteMany({ where: { storePointId: pointId } });
      await prisma.storePoint.delete({ where: { id: pointId } });
    }
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.staffUser.deleteMany({ where: { id: staffId } });
    await app.close();
  });

  it('keeps checkout, ERP activation, snapshots and stock location in one contract', async () => {
    const createdPoint = await request(app.getHttpServer())
      .post('/logistics/store-points')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `point-${run}`)
      .send({ code: pointCode, name: 'AliStore Fulfillment Test', address: 'Бишкек, тестовый адрес 10', inventoryLocation: location, hours: '10:00–20:00' })
      .expect(201);
    pointId = createdPoint.body.id;

    let options = await request(app.getHttpServer()).get('/logistics/checkout-options').expect(200);
    expect(options.body.pickupPoints.map((point: { id: string }) => point.id)).toContain(pointId);

    const suffix = run.replace(/\W/g, '').slice(-12).toUpperCase();
    const localProduct = await prisma.product.create({
      data: { sku: `FUL-LOCAL-${suffix}`, name: 'Local phone', price: 10000, cost: 7000, category: 'phones', attrs: {} },
    });
    productIds.push(localProduct.id);
    const localUnit = await prisma.deviceUnit.create({
      data: { imei: `FUL-IMEI-${suffix}`, productId: localProduct.id, location, status: 'in_stock' },
    });
    const phone = `+99655${run.replace(/\D/g, '').slice(-7).padStart(7, '0')}`;
    const customer = await prisma.customer.create({ data: { phone, name: 'Fulfillment customer' } });
    customerId = customer.id;
    const customerToken = sign({ sub: customer.id, typ: 'customer', phone }, process.env.JWT_SECRET ?? 'dev-insecure-change-me', { expiresIn: '15m' });
    const base = { channel: 'web', fulfillmentType: 'pickup', total: 1, items: [{ sku: localProduct.sku, qty: 1, price: 1 }] };

    await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `unknown-${run}`).send({ ...base, storePointId: 'unknown-point' }).expect(422);
    await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `wrong-location-${run}`).send({ ...base, storePointId: 'alistore-bishkek-1' }).expect(409);

    const orderResponse = await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `local-${run}`).send({ ...base, storePointId: pointId }).expect(201);
    orderIds.push(orderResponse.body.id);
    expect(orderResponse.body).toMatchObject({
      storePointId: pointId,
      storePointCode: pointCode,
      storePointName: 'AliStore Fulfillment Test',
      storePointAddress: 'Бишкек, тестовый адрес 10',
      fulfillmentLocation: location,
    });

    await request(app.getHttpServer()).post(`/orders/${orderResponse.body.id}/fulfill`).set('Authorization', `Bearer ${ownerToken}`).send({}).expect(201);
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { id: localUnit.id } })).toMatchObject({ status: 'reserved', location });

    await request(app.getHttpServer())
      .patch(`/logistics/store-points/${pointId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `disable-blocked-${run}`)
      .send({ active: false })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('store_point_deactivation_blocked'));

    await prisma.reservation.deleteMany({ where: { orderId: orderResponse.body.id } });
    await prisma.order.update({ where: { id: orderResponse.body.id }, data: { status: 'cancelled' } });
    await prisma.deviceUnit.update({ where: { id: localUnit.id }, data: { location: 'ARCHIVE-TEST' } });

    await request(app.getHttpServer())
      .patch(`/logistics/store-points/${pointId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `disable-${run}`)
      .send({ name: 'Renamed point', address: 'Новый адрес', active: false })
      .expect(200);
    options = await request(app.getHttpServer()).get('/logistics/checkout-options').expect(200);
    expect(options.body.pickupPoints.map((point: { id: string }) => point.id)).not.toContain(pointId);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderResponse.body.id } })).toMatchObject({
      storePointName: 'AliStore Fulfillment Test',
      storePointAddress: 'Бишкек, тестовый адрес 10',
    });
    const replay = await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `local-${run}`).send({ ...base, storePointId: pointId }).expect(201);
    expect(replay.body.id).toBe(orderResponse.body.id);
    await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `disabled-${run}`).send({ ...base, storePointId: pointId }).expect(422);

    const deliveryProduct = await prisma.product.create({
      data: { sku: `FUL-DELIVERY-${suffix}`, name: 'Delivery case', price: 1000, cost: 400, category: 'accessories', attrs: {}, trackingMode: 'quantity', balances: { create: { location: 'BISHKEK-1', onHand: 2 } } },
    });
    productIds.push(deliveryProduct.id);
    const exactAddress = 'Бишкек, ул. Токтогула 125/1, кв. 42, домофон 17';
    const delivery = await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `delivery-${run}`).send({ channel: 'web', fulfillmentType: 'courier', deliveryAddress: exactAddress, total: 1, items: [{ sku: deliveryProduct.sku, qty: 1, price: 1 }] }).expect(201);
    orderIds.push(delivery.body.id);
    expect(delivery.body.deliveryAddress).toBe(exactAddress);
  });
});
