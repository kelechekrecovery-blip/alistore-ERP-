import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { issueGuestCheckoutCapability, issueGuestOrderCapability } from '../src/auth/guest-capability';
import { LogisticsModule } from '../src/logistics/logistics.module';
import { OrdersModule } from '../src/orders/orders.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';

describe('Guest order-scoped status and receipt access', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId = '';
  let productId = '';
  const orderIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, LogisticsModule, OrdersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    if (productId) {
      await prisma.inventoryBalance.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await app.close();
  });

  it('returns a scoped link credential and rejects expired, tampered and cross-order reads', async () => {
    const customer = await prisma.customer.create({ data: { phone: `+99655${run.replace(/\D/g, '').slice(-7).padStart(7, '0')}`, name: 'Guest access' } });
    customerId = customer.id;
    const product = await prisma.product.create({
      data: {
        sku: `GUEST-${run}`.toUpperCase(), name: 'Guest receipt phone', price: 25_000, cost: 20_000,
        category: 'phones', attrs: {}, trackingMode: 'quantity', balances: { create: { location: 'BISHKEK-1', onHand: 5 } },
      },
    });
    productId = product.id;
    const checkoutCapability = issueGuestCheckoutCapability(customer.id);
    const created = await request(app.getHttpServer()).post('/orders')
      .set('x-guest-capability', checkoutCapability).set('Idempotency-Key', `guest-order-${run}`)
      .send({ customerId: customer.id, channel: 'web', fulfillmentType: 'courier', deliveryAddress: 'Бишкек, ул. Киевская 10, кв. 5', total: 1, items: [{ sku: product.sku, qty: 1, price: 1 }] })
      .expect(201);
    orderIds.push(created.body.id);
    expect(created.body.guestAccess).toMatchObject({ expiresIn: 604800 });
    const capability = created.body.guestAccess.capability as string;
    expect(capability.split('.')).toHaveLength(3);

    const otherOrder = await prisma.order.create({ data: { customerId: customer.id, channel: 'web', total: 100, items: { create: [{ sku: product.sku, qty: 1, price: 100 }] } } });
    orderIds.push(otherOrder.id);
    await request(app.getHttpServer()).get(`/orders/${created.body.id}/guest`).set('x-guest-capability', checkoutCapability).expect(403);
    await request(app.getHttpServer()).get(`/orders/${otherOrder.id}/guest`).set('x-guest-capability', capability).expect(403);
    await request(app.getHttpServer()).get(`/orders/${created.body.id}/guest`).set('x-guest-capability', `${capability.slice(0, -1)}x`).expect(401);
    await request(app.getHttpServer()).get(`/orders/${created.body.id}/guest`).set('x-guest-capability', issueGuestOrderCapability(customer.id, created.body.id, -1)).expect(401);

    const status = await request(app.getHttpServer()).get(`/orders/${created.body.id}/guest`).set('x-guest-capability', capability).expect(200);
    expect(status.body.order).toMatchObject({ id: created.body.id, total: 25_200, status: 'created' });
    expect(status.body.timeline).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'order.created' })]));
    expect(status.body.order).not.toHaveProperty('customerId');
    expect(status.body.order).not.toHaveProperty('idempotencyKey');
    expect(JSON.stringify(status.body)).not.toContain(capability);

    await request(app.getHttpServer()).get(`/orders/${created.body.id}/guest-receipt`).set('x-guest-capability', capability).expect(409);
    await prisma.payment.create({ data: { orderId: created.body.id, amount: 25_200, method: 'card', status: 'received', txnId: `guest-receipt-${run}` } });
    const receipt = await request(app.getHttpServer()).get(`/orders/${created.body.id}/guest-receipt`).set('x-guest-capability', capability).expect(200);
    expect(receipt.body.markup).toContain('Guest receipt phone');
    expect(receipt.body.markup).toContain('25 200');
    expect(receipt.body).not.toHaveProperty('escposBase64');
    expect(receipt.body).not.toHaveProperty('svg');
    const ledger = await prisma.auditEvent.findMany({ where: { refs: { has: created.body.id } } });
    expect(JSON.stringify(ledger)).not.toContain(capability);
  });
});
