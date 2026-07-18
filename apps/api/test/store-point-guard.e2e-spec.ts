import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { LogisticsModule } from '../src/logistics/logistics.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Store point deactivation guard (LOGIC-009)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const suffix = run.replace(/\W/g, '').slice(-12).toUpperCase();
  const pointIds: string[] = [];
  const shiftIds: string[] = [];
  const orderIds: string[] = [];
  const productIds: string[] = [];
  let staffId = '';
  let customerId = '';
  let requestCounter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, LogisticsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(StaffAuthService);
    const staff = await auth.createStaff(`guard-owner-${run}`, 'pass', 'owner');
    staffId = staff.id;
    ownerToken = (await auth.login(staff.username, 'pass')).accessToken;
    const phone = `+99655${run.replace(/\D/g, '').slice(-7).padStart(7, '0')}`;
    const customer = await prisma.customer.create({ data: { phone, name: 'Guard customer' } });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.cashShift.deleteMany({ where: { id: { in: shiftIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.storePointCommand.deleteMany({ where: { storePointId: { in: pointIds } } });
    await prisma.storePoint.deleteMany({ where: { id: { in: pointIds } } });
    await prisma.storePoint.updateMany({ where: { id: 'alistore-bishkek-1' }, data: { active: true } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.staffUser.deleteMany({ where: { id: staffId } });
    await app.close();
  });

  async function createPoint(label: string) {
    const created = await request(app.getHttpServer())
      .post('/logistics/store-points')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `guard-point-${label}-${run}`)
      .send({
        code: `guard-${label}-${run}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: `Guard point ${label}`,
        address: 'Бишкек, тестовый адрес guard',
        inventoryLocation: `GRD-${label}-${suffix}`.toUpperCase(),
        hours: '10:00–20:00',
      })
      .expect(201);
    pointIds.push(created.body.id);
    return created.body as { id: string; inventoryLocation: string };
  }

  function deactivate(pointId: string, label: string) {
    requestCounter += 1;
    return request(app.getHttpServer())
      .patch(`/logistics/store-points/${pointId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `guard-off-${label}-${requestCounter}-${run}`)
      .send({ active: false });
  }

  it('blocks deactivation while a cash shift is open on the point location', async () => {
    const point = await createPoint('shift');
    const shift = await prisma.cashShift.create({
      data: { staffId, point: point.inventoryLocation, openCash: 0 },
    });
    shiftIds.push(shift.id);

    await deactivate(point.id, 'shift')
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('store_point_deactivation_blocked');
        expect(body.message).toContain('кассовая смена');
        expect(body.message).toContain(shift.id);
      });
    expect(await prisma.storePoint.findUniqueOrThrow({ where: { id: point.id } })).toMatchObject({ active: true });
  });

  it('blocks deactivation with an active order on the point', async () => {
    const point = await createPoint('order');
    const order = await prisma.order.create({
      data: {
        customerId,
        channel: 'web',
        fulfillmentType: 'pickup',
        total: 1,
        status: 'paid',
        storePointId: point.id,
      },
    });
    orderIds.push(order.id);

    await deactivate(point.id, 'order')
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('store_point_deactivation_blocked');
        expect(body.message).toContain(order.id);
        expect(body.message).toContain('paid');
      });
    expect(await prisma.storePoint.findUniqueOrThrow({ where: { id: point.id } })).toMatchObject({ active: true });
  });

  it('blocks deactivation while stock remains on the point location', async () => {
    const point = await createPoint('stock');
    const product = await prisma.product.create({
      data: { sku: `GRD-STOCK-${suffix}`, name: 'Guard stock case', price: 1000, cost: 400, category: 'accessories', attrs: {}, trackingMode: 'quantity' },
    });
    productIds.push(product.id);
    await prisma.inventoryBalance.create({
      data: { productId: product.id, location: point.inventoryLocation, onHand: 2 },
    });

    await deactivate(point.id, 'stock')
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('store_point_deactivation_blocked');
        expect(body.message).toContain('остаток');
      });
    expect(await prisma.storePoint.findUniqueOrThrow({ where: { id: point.id } })).toMatchObject({ active: true });
  });

  it('always blocks deactivating the last active store point', async () => {
    const point = await createPoint('last');
    const previouslyActive = await prisma.storePoint.findMany({
      where: { active: true, id: { not: point.id } },
      select: { id: true },
    });
    await prisma.storePoint.updateMany({ where: { id: { not: point.id } }, data: { active: false } });
    try {
      await deactivate(point.id, 'last')
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe('store_point_deactivation_blocked');
          expect(body.message).toContain('последняя активная точка');
        });
      expect(await prisma.storePoint.findUniqueOrThrow({ where: { id: point.id } })).toMatchObject({ active: true });
    } finally {
      await prisma.storePoint.updateMany({
        where: { id: { in: previouslyActive.map((other) => other.id) } },
        data: { active: true },
      });
    }
  });

  it('deactivates a clean point and repeats idempotently', async () => {
    await prisma.storePoint.updateMany({ where: { id: 'alistore-bishkek-1' }, data: { active: true } });
    const point = await createPoint('clean');

    const first = await deactivate(point.id, 'clean').expect(200);
    expect(first.body).toMatchObject({ id: point.id, active: false });

    // Idempotency-key replay: same stored response, no new command.
    const replayKey = `guard-replay-${run}`;
    const original = await request(app.getHttpServer())
      .patch(`/logistics/store-points/${point.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', replayKey)
      .send({ active: false, name: 'Guard point clean' })
      .expect(200);
    const replay = await request(app.getHttpServer())
      .patch(`/logistics/store-points/${point.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', replayKey)
      .send({ active: false, name: 'Guard point clean' })
      .expect(200);
    expect(replay.body).toEqual(original.body);

    // Re-deactivation of an already inactive point with a fresh key is a soft no-op.
    await deactivate(point.id, 'again').expect(200);
    expect(await prisma.storePoint.findUniqueOrThrow({ where: { id: point.id } })).toMatchObject({ active: false });
  });
});
