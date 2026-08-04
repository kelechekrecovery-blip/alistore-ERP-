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
  let sellerId: string;
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
    sellerId = seller.id;
    sellerToken = seller.token;

    const warehouse = await createSession('warehouse');
    warehouseId = warehouse.id;
    warehouseToken = warehouse.token;
  });

  afterAll(async () => {
    await prisma.consignmentItem.deleteMany();
    await prisma.consignmentPayout.deleteMany();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.consignmentItem.deleteMany();
    await prisma.consignmentPayout.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
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
      .send({ staffId: 'spoof', point: 'OSH-SPOOF', openCash: 0 })
      .expect(201);
    expect(opened.body.staffId).toBe(staffId);
    expect(opened.body.point).toBe('BISHKEK-1');

    const current = await request(app.getHttpServer())
      .get('/shifts/current?staffId=spoof')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(current.body.staffId).toBe(staffId);

    await prisma.payment.create({
      data: { shiftId: opened.body.id, amount: 7_000, method: 'cash', status: 'received' },
    });
    const ownDetail = await request(app.getHttpServer())
      .get(`/shifts/${opened.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(ownDetail.body).not.toHaveProperty('payments');
    const ownManagerList = await request(app.getHttpServer())
      .get('/shifts/open?point=BISHKEK-1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(ownManagerList.body.shifts[0]).not.toHaveProperty('expectedCash');
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

  it('keeps the cashier count blind, blocks foreign shift reads and reveals reconciliation only after close', async () => {
    const opened = await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('Idempotency-Key', `blind-open-${RUN}`)
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 5_000 })
      .expect(201);
    await prisma.payment.create({
      data: { shiftId: opened.body.id, amount: 10_000, method: 'cash', status: 'received' },
    });

    const own = await request(app.getHttpServer())
      .get(`/shifts/${opened.body.id}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);
    expect(own.body).not.toHaveProperty('payments');
    expect(own.body).not.toHaveProperty('expectedCash');

    await request(app.getHttpServer())
      .get(`/shifts/${opened.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(404);

    const ownOpen = await request(app.getHttpServer())
      .get('/shifts/open?point=BISHKEK-1')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);
    expect(ownOpen.body.shifts).toHaveLength(1);
    expect(ownOpen.body.shifts[0]).not.toHaveProperty('expectedCash');

    const managerView = await request(app.getHttpServer())
      .get(`/shifts/${opened.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(managerView.body.payments).toEqual([
      expect.objectContaining({ amount: 10_000, method: 'cash' }),
    ]);

    await request(app.getHttpServer())
      .post(`/shifts/${opened.body.id}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ closeCash: 14_000 })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('idempotency_key_required'));
    expect((await prisma.cashShift.findUniqueOrThrow({ where: { id: opened.body.id } })).closedAt).toBeNull();

    const closed = await request(app.getHttpServer())
      .post(`/shifts/${opened.body.id}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('Idempotency-Key', `blind-close-${RUN}`)
      .send({ closeCash: 14_000 })
      .expect(201);
    expect(closed.body).toMatchObject({ expected: 15_000, diff: -1_000 });
    const persisted = await prisma.cashShift.findUniqueOrThrow({ where: { id: opened.body.id } });
    expect(persisted.closeReason).toBe('Слепой пересчёт кассы');
    const shortage = await prisma.auditEvent.findFirstOrThrow({
      where: { type: 'cash.shortage', refs: { has: opened.body.id } },
    });
    expect(shortage.payload).toMatchObject({
      reconciliationMode: 'blind',
      reasonSource: 'system',
      userNote: null,
    });

    const sellerShift = await prisma.cashShift.create({
      data: { staffId: sellerId, point: 'BISHKEK-1', openCash: 5_000 },
    });
    const managerMismatch = await request(app.getHttpServer())
      .post(`/shifts/${sellerShift.id}/close`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `manager-blind-close-${RUN}`)
      .send({ closeCash: 4_000 })
      .expect(422);
    expect(managerMismatch.body.message).toBe('Расхождение кассы требует причину');
    expect(managerMismatch.body.message).not.toContain('-1000');
  });

  it('requires staff JWT for POS sale and books the shift under the JWT staff id', async () => {
    const product = await productWithUnit('OPS-POS');
    const payload = {
      point: 'BISHKEK-1',
      method: 'cash',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };

    await request(app.getHttpServer()).post('/pos/sale').send(payload).expect(401);

    // A counter sale requires an open cash shift (Event Ledger invariant): the
    // cashier opens one before ringing anything, it is never fabricated by the sale.
    await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 0 })
      .expect(201);

    const sale = await request(app.getHttpServer())
      .post('/pos/sale')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);
    const shift = await prisma.cashShift.findUnique({ where: { id: sale.body.shiftId } });
    expect(shift?.staffId).toBe(staffId);

    const detail = await request(app.getHttpServer())
      .get(`/orders/${sale.body.orderId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({ posShiftId: null, payments: [], drawerBlind: true });

    const webCustomer = await prisma.customer.create({
      data: { phone: `+996700${RUN}77`, name: 'Web queue customer' },
    });
    const webOrder = await prisma.order.create({
      data: {
        customerId: webCustomer.id,
        channel: 'web',
        status: 'paid',
        total: 1_000,
        items: { create: { sku: `WEB-QUEUE-${RUN}`, qty: 1, price: 1_000 } },
      },
    });
    const queue = await request(app.getHttpServer())
      .get('/orders?status=paid')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(queue.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: webOrder.id })]),
    );
    expect(queue.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sale.body.orderId })]),
    );

    await request(app.getHttpServer())
      .get(`/orders/${sale.body.orderId}/ledger`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
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

    await request(app.getHttpServer())
      .post('/shifts/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ staffId: 'spoof', point: 'BISHKEK-1', openCash: 0 })
      .expect(201);

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

  it('receives quantity stock with warehouse RBAC and exposes the JWT actor', async () => {
    const product = await prisma.product.create({
      data: {
        sku: `OPS-RCV-QTY-${RUN}`,
        name: 'USB-C cable',
        price: 1500,
        cost: 700,
        category: 'accessories',
        trackingMode: 'quantity',
        attrs: {},
      },
    });
    // Ключ обязателен: приёмка количественного товара была единственным путём
    // оприходования без идемпотентности, и повтор удваивал остаток согласованно
    // со слоями оценки — сверка объявляла такое состояние здоровым.
    const payload = { idempotencyKey: `recv-staff-ops-${RUN}`, productId: product.id, location: 'BISHKEK-1', quantity: 12, requester: 'spoof' };

    await request(app.getHttpServer()).post('/inventory/receive-quantity').send(payload).expect(401);
    await request(app.getHttpServer())
      .post('/inventory/receive-quantity')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(payload)
      .expect(403);
    const received = await request(app.getHttpServer())
      .post('/inventory/receive-quantity')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(payload)
      .expect(201);

    expect(received.body).toMatchObject({ onHand: 12, reserved: 0, available: 12 });
    const event = await prisma.auditEvent.findFirst({ where: { type: 'stock.received' } });
    expect(event?.actor).toBe(warehouseId);
  });

  it('separates consignment receiving/read permissions from owner/admin payouts', async () => {
    const product = await productOnly('OPS-CONSIGN');
    const payload = {
      idempotencyKey: `ops-consignment-${RUN}`,
      productId: product.id,
      imei: `OPS-CONSIGN-IMEI-${RUN}`,
      location: 'BISHKEK-1',
      ownerName: 'Клиент Б.',
      ownerContact: '+996555000111',
      commissionBps: 1000,
      grade: 'B',
    };

    await request(app.getHttpServer()).post('/inventory/consignments/receive').send(payload).expect(401);
    await request(app.getHttpServer())
      .post('/inventory/consignments/receive')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send(payload)
      .expect(403);
    const received = await request(app.getHttpServer())
      .post('/inventory/consignments/receive')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(payload)
      .expect(201);
    expect(received.body).toMatchObject({ ownerName: 'Клиент Б.', commissionBps: 1000, status: 'active' });

    const rows = await request(app.getHttpServer())
      .get('/inventory/consignments')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);
    expect(rows.body).toHaveLength(1);
    expect((await prisma.auditEvent.findFirst({ where: { type: 'consignment.received' } }))?.actor).toBe(warehouseId);

    await request(app.getHttpServer())
      .post('/inventory/consignments/payouts')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `forbidden-payout-${RUN}`, itemIds: [received.body.id] })
      .expect(403);
    await request(app.getHttpServer())
      .post('/inventory/consignments/payouts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ idempotencyKey: `premature-payout-${RUN}`, itemIds: [received.body.id] })
      .expect(409);
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
