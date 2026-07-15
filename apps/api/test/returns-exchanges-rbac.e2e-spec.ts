import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { ExchangesModule } from '../src/exchanges/exchanges.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReturnsModule } from '../src/returns/returns.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { UnitsModule } from '../src/units/units.module';

describe('Returns and exchanges RBAC split', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let cashierToken: string;
  let cashierId: string;
  let courierToken: string;
  let sellerToken: string;
  let warehouseToken: string;
  let warehouseId: string;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' });
  const RUN = Math.floor(Math.random() * 1_000_000);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ReturnsModule,
        ExchangesModule,
        UnitsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'cashier' | 'courier' | 'seller' | 'warehouse') => {
      const username = `${role}-return-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const cashier = await createSession('cashier');
    cashierId = cashier.id;
    cashierToken = cashier.token;
    courierToken = (await createSession('courier')).token;
    sellerToken = (await createSession('seller')).token;
    const warehouse = await createSession('warehouse');
    warehouseId = warehouse.id;
    warehouseToken = warehouse.token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { sourceType: { in: ['exchange.return', 'exchange.sale', 'exchange.surcharge', 'inventory.cogs', 'inventory.return'] } } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { sourceType: { in: ['exchange.return', 'exchange.sale', 'exchange.surcharge', 'inventory.cogs', 'inventory.return'] } },
      }),
    ]);
    await prisma.inventoryValuationIssue.deleteMany();
    await prisma.inventoryValuationLayer.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.approval.deleteMany();
  });

  function customerToken(customer: { id: string; phone: string }) {
    return jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });
  }

  async function paidOrderFixture(oldPrice = 100000, newPrice = 130000) {
    seq += 1;
    const customer = await prisma.customer.create({
      data: { phone: `+996707${RUN}${seq}`, name: 'Return RBAC' },
    });
    const oldProduct = await prisma.product.create({
      data: { sku: `RBAC-OLD-${RUN}-${seq}`, name: 'old', price: oldPrice, cost: 1, category: 'c', attrs: {} },
    });
    const newProduct = await prisma.product.create({
      data: { sku: `RBAC-NEW-${RUN}-${seq}`, name: 'new', price: newPrice, cost: 1, category: 'c', attrs: {} },
    });
    const oldImei = `RBAC-OLD-${RUN}-${seq}`;
    const newImei = `RBAC-NEW-${RUN}-${seq}`;
    await prisma.deviceUnit.create({ data: { imei: oldImei, productId: oldProduct.id, status: 'sold', location: 'B' } });
    await prisma.deviceUnit.create({ data: { imei: newImei, productId: newProduct.id, status: 'in_stock', location: 'B' } });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        storePointCode: 'B',
        fulfillmentLocation: 'B',
        total: oldPrice,
        status: 'paid',
        items: { create: [{ sku: oldProduct.sku, qty: 1, price: oldPrice, imei: oldImei }] },
      },
    });
    await prisma.deviceUnit.update({ where: { imei: oldImei }, data: { orderId: order.id } });
    return { customer, order, oldImei, newProduct };
  }

  it('guards return self-service, staff return ops, unit lookup, and exchanges', async () => {
    const { customer, order } = await paidOrderFixture();
    const other = await prisma.customer.create({
      data: { phone: `+996708${RUN}`, name: 'Other customer' },
    });

    await request(app.getHttpServer())
      .post('/returns')
      .send({ orderId: order.id, reason: 'wrong size', requester: 'spoof' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/returns')
      .set('Authorization', `Bearer ${customerToken(other)}`)
      .send({ orderId: order.id, reason: 'wrong size', requester: 'spoof' })
      .expect(403);

    const ret = await request(app.getHttpServer())
      .post('/returns')
      .set('Authorization', `Bearer ${customerToken(customer)}`)
      .send({ orderId: order.id, reason: 'wrong size', requester: 'spoof' })
      .expect(201);

    const requested = await prisma.auditEvent.findFirst({ where: { type: 'return.requested' } });
    expect(requested?.actor).toBe(customer.id);

    await request(app.getHttpServer()).get('/returns').expect(401);
    await request(app.getHttpServer())
      .get('/returns')
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/returns')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/returns/${ret.body.id}`)
      .set('Authorization', `Bearer ${courierToken}`)
      .send({ status: 'under_review' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/returns/${ret.body.id}`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ status: 'under_review' })
      .expect(200);

    const reviewed = await prisma.auditEvent.findFirst({ where: { type: 'return.under_review' } });
    expect(reviewed?.actor).toBe(warehouseId);

    const exchange = await paidOrderFixture(100000, 130000);
    const shift = await prisma.cashShift.create({ data: { staffId: cashierId, point: 'B', openCash: 0 } });
    await request(app.getHttpServer()).get(`/units/${exchange.oldImei}`).expect(401);
    await request(app.getHttpServer())
      .get(`/units/${exchange.oldImei}`)
      .set('Authorization', `Bearer ${courierToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/units/${exchange.oldImei}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/exchanges')
      .send({
        originalOrderId: exchange.order.id,
        oldImei: exchange.oldImei,
        newProductId: exchange.newProduct.id,
        method: 'cash',
        shiftId: shift.id,
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/exchanges')
      .set('Authorization', `Bearer ${courierToken}`)
      .send({
        originalOrderId: exchange.order.id,
        oldImei: exchange.oldImei,
        newProductId: exchange.newProduct.id,
        method: 'cash',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post('/exchanges')
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('Idempotency-Key', `exchange-${RUN}`)
      .send({
        originalOrderId: exchange.order.id,
        oldImei: exchange.oldImei,
        newProductId: exchange.newProduct.id,
        method: 'cash',
        shiftId: shift.id,
      })
      .expect(201);

    const exchanged = await prisma.auditEvent.findFirst({ where: { type: 'order.exchanged' } });
    expect(exchanged?.actor).toBe(cashierId);
  });

  it('opens and lists native returns with owner scope and exact idempotent replay', async () => {
    const { customer, order } = await paidOrderFixture();
    const other = await prisma.customer.create({
      data: { phone: `+996709${RUN}`, name: 'Other native return customer' },
    });
    const token = customerToken(customer);
    const payload = { orderId: order.id, reason: 'Не подошёл / передумал' };

    await request(app.getHttpServer())
      .post('/returns/mine')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(400);

    const calls = await Promise.all([
      request(app.getHttpServer()).post('/returns/mine').set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `native-return-${RUN}`).send(payload),
      request(app.getHttpServer()).post('/returns/mine').set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `native-return-${RUN}`).send(payload),
    ]);
    expect(calls.map((call) => call.status)).toEqual([201, 201]);
    expect(calls[0].body.id).toBe(calls[1].body.id);

    await request(app.getHttpServer())
      .post('/returns/mine')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `native-return-${RUN}`)
      .send({ ...payload, reason: 'Другая причина' })
      .expect(409);

    const mine = await request(app.getHttpServer())
      .get('/returns/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].orderId).toBe(order.id);
    expect(mine.body[0].order.total).toBe(order.total);

    const otherMine = await request(app.getHttpServer())
      .get('/returns/mine')
      .set('Authorization', `Bearer ${customerToken(other)}`)
      .expect(200);
    expect(otherMine.body).toEqual([]);
    expect(await prisma.auditEvent.count({ where: { type: 'return.requested' } })).toBe(1);
  });
});
