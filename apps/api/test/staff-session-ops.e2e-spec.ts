import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import { AuditModule } from '../src/audit/audit.module';
import { InventoryModule } from '../src/inventory/inventory.module';
import { OrdersModule } from '../src/orders/orders.module';
import { PosModule } from '../src/pos/pos.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { ShiftsModule } from '../src/shifts/shifts.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Staff session rollout for operational endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let accessToken: string;
  let staffId: string;
  let cashierToken: string;
  let cashierId: string;
  let sellerToken: string;
  let warehouseToken: string;
  let warehouseId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ShiftsModule,
        InventoryModule,
        OrdersModule,
        PosModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'cashier' | 'seller' | 'warehouse') => {
      const username = `${role}-ops-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    staffId = admin.id;
    accessToken = admin.token;

    const cashier = await createSession('cashier');
    cashierId = cashier.id;
    cashierToken = cashier.token;

    const seller = await createSession('seller');
    sellerToken = seller.token;

    const warehouse = await createSession('warehouse');
    warehouseId = warehouse.id;
    warehouseToken = warehouse.token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function productWithUnit(prefix: string) {
    const product = await prisma.product.create({
      data: {
        sku: `${prefix}-${RUN}`,
        name: 'iPhone',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    await prisma.deviceUnit.create({
      data: {
        imei: `${prefix}-IMEI-${RUN}`,
        productId: product.id,
        status: 'in_stock',
        location: 'BISHKEK-1',
      },
    });
    return product;
  }

  async function productOnly(prefix: string) {
    return prisma.product.create({
      data: {
        sku: `${prefix}-${RUN}`,
        name: 'iPhone',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
  }

  it('requires staff JWT for shifts and ignores body/query staffId spoofing', async () => {
    await request(app.getHttpServer())
      .post('/shifts/open')
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 0 })
      .expect(401);

    const opened = await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 0 })
      .expect(201);
    expect(opened.body.staffId).toBe(staffId);

    const current = await request(app.getHttpServer())
      .get('/shifts/current?staffId=spoof')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(current.body.staffId).toBe(staffId);
  });

  it('protects order detail from anonymous and foreign-customer IDOR', async () => {
    const owner = await prisma.customer.create({
      data: { phone: `+996700${RUN}01`, name: 'Order owner' },
    });
    const foreign = await prisma.customer.create({
      data: { phone: `+996700${RUN}02`, name: 'Foreign customer' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: owner.id,
        channel: 'web',
        total: 100,
        items: { create: { sku: `IDOR-${RUN}`, qty: 1, price: 100 } },
      },
    });
    const customerToken = (id: string, phone: string) => sign(
      { sub: id, typ: 'customer', phone },
      process.env.JWT_SECRET ?? 'dev-insecure-change-me',
      { expiresIn: '15m' },
    );

    await request(app.getHttpServer()).get(`/orders/${order.id}`).expect(401);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${customerToken(foreign.id, foreign.phone)}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${customerToken(owner.id, owner.phone)}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/orders/${order.id}`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);
  });

  it('enforces shift role permissions after staff JWT auth', async () => {
    await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 0 })
      .expect(403);

    const opened = await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 0 })
      .expect(201);
    expect(opened.body.staffId).toBe(cashierId);
  });

  it('requires staff JWT for POS sale and books the shift under the JWT staff id', async () => {
    const product = await productWithUnit('OPS-POS');
    const payload = {
      staffId: 'spoof',
      point: 'BISHKEK-1',
      method: 'cash',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    await request(app.getHttpServer()).post('/pos/sale').send(payload).expect(401);

    const sale = await request(app.getHttpServer())
      .post('/pos/sale')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);
    const shift = await prisma.cashShift.findUnique({ where: { id: sale.body.shiftId } });
    expect(shift?.staffId).toBe(staffId);
  });

  it('enforces POS sale role permissions before booking a sale', async () => {
    const product = await productWithUnit('OPS-POS-RBAC');
    const payload = {
      staffId: 'spoof',
      point: 'BISHKEK-1',
      method: 'cash',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    await request(app.getHttpServer())
      .post('/pos/sale')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(payload)
      .expect(403);

    const sale = await request(app.getHttpServer())
      .post('/pos/sale')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(payload)
      .expect(201);
    const shift = await prisma.cashShift.findUnique({ where: { id: sale.body.shiftId } });
    expect(shift?.staffId).toBe(cashierId);
  });

  it('requires staff JWT for inventory transfer and writes actor from JWT', async () => {
    await request(app.getHttpServer())
      .post('/inventory/transfer')
      .send({ imei: 'x', to: 'BISHKEK-2' })
      .expect(401);

    await productWithUnit('OPS-TR');
    await request(app.getHttpServer())
      .post('/inventory/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ imei: `OPS-TR-IMEI-${RUN}`, to: 'BISHKEK-2', requester: 'spoof' })
      .expect(201);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'stock.moved' } });
    expect(event?.actor).toBe(staffId);
  });

  it('enforces inventory role permissions and keeps actor from JWT', async () => {
    await productWithUnit('OPS-INV-RBAC');
    await request(app.getHttpServer())
      .post('/inventory/transfer')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ imei: `OPS-INV-RBAC-IMEI-${RUN}`, to: 'BISHKEK-2', requester: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/inventory/transfer')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ imei: `OPS-INV-RBAC-IMEI-${RUN}`, to: 'BISHKEK-2', requester: 'spoof' })
      .expect(201);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'stock.moved' } });
    expect(event?.actor).toBe(warehouseId);
  });

  it('receives inventory batches with warehouse RBAC and keeps actor from JWT', async () => {
    const product = await productOnly('OPS-RCV');
    const payload = {
      productId: product.id,
      location: 'BISHKEK-1',
      grade: 'A',
      imeis: [`OPS-RCV-${RUN}-1`, `OPS-RCV-${RUN}-2`],
      requester: 'spoof',
    };

    await request(app.getHttpServer())
      .post('/inventory/receive')
      .send(payload)
      .expect(401);

    await request(app.getHttpServer())
      .post('/inventory/receive')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(payload)
      .expect(403);

    const received = await request(app.getHttpServer())
      .post('/inventory/receive')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(payload)
      .expect(201);

    expect(received.body.received).toBe(2);
    expect(await prisma.deviceUnit.count({ where: { productId: product.id, status: 'in_stock' } })).toBe(2);
    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: product.id, type: 'received' } });
    expect(movement?.qty).toBe(2);

    const stockEvent = await prisma.auditEvent.findFirst({ where: { type: 'stock.received' } });
    expect(stockEvent?.actor).toBe(warehouseId);
    const unitEvents = await prisma.auditEvent.findMany({ where: { type: 'unit.received' } });
    expect(unitEvents).toHaveLength(2);
    expect(unitEvents.every((event) => event.actor === warehouseId)).toBe(true);
  });

  it('requires staff JWT for order queue and fulfillment operations', async () => {
    const product = await productWithUnit('OPS-WH');
    const customer = await prisma.customer.create({
      data: { phone: `+9967008${RUN}`, name: 'Ops' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        status: 'created',
        channel: 'web',
        total: 100000,
        items: { create: [{ sku: product.sku, qty: 1, price: 100000 }] },
      },
    });

    await request(app.getHttpServer()).get('/orders?status=created').expect(401);
    await request(app.getHttpServer())
      .get('/orders?status=created')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer()).post(`/orders/${order.id}/fulfill`).send({}).expect(401);
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/fulfill`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'order.reserved' } });
    expect(event?.actor).toBe(staffId);
  });

  it('enforces order fulfillment role permissions', async () => {
    const product = await productWithUnit('OPS-ORD-RBAC');
    const customer = await prisma.customer.create({
      data: { phone: `+9967009${RUN}`, name: 'Ops RBAC' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        status: 'created',
        channel: 'web',
        total: 100000,
        items: { create: [{ sku: product.sku, qty: 1, price: 100000 }] },
      },
    });

    await request(app.getHttpServer())
      .get('/orders?status=created')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/orders?status=created')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/orders/${order.id}/fulfill`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/fulfill`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({})
      .expect(201);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'order.reserved' } });
    expect(event?.actor).toBe(warehouseId);
  });
});
