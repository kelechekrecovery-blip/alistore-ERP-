import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { CourierModule } from '../src/courier/courier.module';
import { LogisticsModule } from '../src/logistics/logistics.module';
import { OrdersModule } from '../src/orders/orders.module';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Logistics zones, capacity and dispatch (integration + RBAC)', () => {
  let app: INestApplication; let prisma: PrismaService; let orders: OrdersService;
  let ownerToken: string; let sellerToken: string; let courierToken: string; let courierId: string;
  const run = Math.floor(Math.random() * 1_000_000); const date = '2026-07-20';
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, LogisticsModule, OrdersModule, CourierModule] }).compile();
    app = moduleRef.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
    prisma = moduleRef.get(PrismaService); orders = moduleRef.get(OrdersService); const auth = moduleRef.get(StaffAuthService);
    const session = async (role: 'owner' | 'seller' | 'courier') => { const username = `${role}-logistics-${run}`; const staff = await auth.createStaff(username, 'pass', role); return { id: staff.id, token: (await auth.login(username, 'pass')).accessToken }; };
    ownerToken = (await session('owner')).token; sellerToken = (await session('seller')).token; const courier = await session('courier'); courierToken = courier.token; courierId = courier.id;
  });
  afterAll(async () => {
    const zones = await prisma.deliveryZone.findMany({ where: { code: `center-${run}` }, select: { id: true } });
    const zoneIds = zones.map((zone) => zone.id);
    const scopedOrders = await prisma.order.findMany({ where: { deliveryZoneId: { in: zoneIds } }, select: { id: true, courierRunId: true } });
    const orderIds = scopedOrders.map((order) => order.id);
    await prisma.courierCommand.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.courierRun.deleteMany({ where: { id: { in: scopedOrders.map((order) => order.courierRunId).filter((id): id is string => Boolean(id)) } } });
    await prisma.deliverySlot.deleteMany({ where: { zoneId: { in: zoneIds } } });
    await prisma.deliveryZone.deleteMany({ where: { id: { in: zoneIds } } });
    const product = await prisma.product.findUnique({ where: { sku: `LOG-${run}` } });
    if (product) { await prisma.inventoryBalance.deleteMany({ where: { productId: product.id } }); await prisma.product.delete({ where: { id: product.id } }); }
    await prisma.customer.deleteMany({ where: { name: { in: ['A', 'B'] }, phone: { contains: String(run) } } });
    await prisma.staffUser.deleteMany({ where: { username: { contains: `-logistics-${run}` } } });
    await app.close();
  });

  it('books one checkout atomically, releases cancellation and dispatches the replacement', async () => {
    const zonePayload = { code: `center-${run}`, name: 'Центр', fee: 300, etaMinMinutes: 60, etaMaxMinutes: 120 };
    await request(app.getHttpServer()).post('/logistics/zones').set('Authorization', `Bearer ${sellerToken}`).set('Idempotency-Key', `zone-${run}`).send(zonePayload).expect(403);
    const zone = await request(app.getHttpServer()).post('/logistics/zones').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `zone-${run}`).send(zonePayload).expect(201);
    const slot = await request(app.getHttpServer()).post('/logistics/slots').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `slot-${run}`).send({ zoneId: zone.body.id, startsAt: `${date}T04:00:00.000Z`, endsAt: `${date}T06:00:00.000Z`, capacity: 1 }).expect(201);
    const product = await prisma.product.create({ data: { sku: `LOG-${run}`, name: 'Logistics phone', price: 1000, cost: 700, category: 'phones', attrs: {}, trackingMode: 'quantity', balances: { create: { location: 'BISHKEK-1', onHand: 2 } } } });
    const customerA = await prisma.customer.create({ data: { phone: `+996701${run}1`, name: 'A' } });
    const customerB = await prisma.customer.create({ data: { phone: `+996701${run}2`, name: 'B' } });
    const token = (id: string, phone: string) => sign({ sub: id, typ: 'customer', phone }, process.env.JWT_SECRET ?? 'dev-insecure-change-me', { expiresIn: '15m' });
    const payload = { channel: 'web', fulfillmentType: 'courier', paymentMode: 'cod', deliveryAddress: 'Бишкек, Киевская 95', deliverySlot: '10:00–12:00', deliveryZoneId: zone.body.id, deliverySlotId: slot.body.id, total: 1, items: [{ sku: product.sku, qty: 1, price: 1 }] };
    await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${token(customerA.id, customerA.phone)}`).set('Idempotency-Key', `order-pickup-spoof-${run}`).send({ ...payload, fulfillmentType: 'pickup' }).expect(422);
    const results = await Promise.all([
      request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${token(customerA.id, customerA.phone)}`).set('Idempotency-Key', `order-a-${run}`).send(payload),
      request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${token(customerB.id, customerB.phone)}`).set('Idempotency-Key', `order-b-${run}`).send(payload),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const winner = results.find((result) => result.status === 201)!;
    expect(winner.body).toMatchObject({ deliveryFee: 300, total: 1300, deliveryZoneId: zone.body.id, deliverySlotId: slot.body.id });
    let availability = await request(app.getHttpServer()).get(`/logistics/availability?date=${date}&zoneId=${zone.body.id}`).expect(200);
    expect(availability.body[0].slots[0]).toMatchObject({ reserved: 1, remaining: 0, available: false });

    await orders.transition(winner.body.id, 'cancelled', 'test-owner');
    const replacementCustomer = winner.body.customerId === customerA.id ? customerB : customerA;
    const replacement = await request(app.getHttpServer()).post('/orders/mine').set('Authorization', `Bearer ${token(replacementCustomer.id, replacementCustomer.phone)}`).set('Idempotency-Key', `order-replacement-${run}`).send(payload).expect(201);
    await prisma.order.update({ where: { id: replacement.body.id }, data: { status: 'packed' } });
    const overview = await request(app.getHttpServer()).get(`/logistics/overview?date=${date}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(overview.body.pendingOrders.map((order: { id: string }) => order.id)).toContain(replacement.body.id);

    const runResponse = await request(app.getHttpServer()).post('/courier/runs').set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', `assign-${replacement.body.id}`).send({ courierId, orderIds: [replacement.body.id], codTotal: 1300 }).expect(201);
    expect(runResponse.body.orderIds).toEqual([replacement.body.id]);
    const courierDeliveries = await request(app.getHttpServer()).get('/courier/me/deliveries').set('Authorization', `Bearer ${courierToken}`).expect(200);
    expect(courierDeliveries.body.map((order: { id: string }) => order.id)).toContain(replacement.body.id);
    availability = await request(app.getHttpServer()).get(`/logistics/availability?date=${date}`).expect(200);
    expect(availability.body[0].slots[0].reserved).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: { startsWith: 'logistics.' }, refs: { has: zone.body.id } } })).toBe(2);
  });
});
