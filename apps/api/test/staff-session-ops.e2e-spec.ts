import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
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

    const staff = await staffAuth.createStaff(`ops-${RUN}`, 'pass', 'admin');
    staffId = staff.id;
    accessToken = (await staffAuth.login(`ops-${RUN}`, 'pass')).accessToken;
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
});
