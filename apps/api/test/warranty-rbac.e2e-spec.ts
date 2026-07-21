import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { WarrantyModule } from '../src/warranty/warranty.module';
import { issueGuestCheckoutCapability } from '../src/auth/guest-capability';

describe('Warranty console RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let jwt: JwtService;
  let sellerToken: string;
  let sellerId: string;
  let courierToken: string;
  let warehouseToken: string;
  let warehouseId: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        WarrantyModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);
    jwt = moduleRef.get(JwtService);

    const createSession = async (role: 'seller' | 'warehouse' | 'courier') => {
      const username = `${role}-warranty-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const seller = await createSession('seller');
    sellerId = seller.id;
    sellerToken = seller.token;

    courierToken = (await createSession('courier')).token;

    const warehouse = await createSession('warehouse');
    warehouseId = warehouse.id;
    warehouseToken = warehouse.token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.warrantyOpenCommand.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.servicePart.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.inventoryQuarantineCase.deleteMany();
    await prisma.$transaction(async (tx) => {
      await tx.inventoryValuationIssue.updateMany({ data: { reversedQty: 0 } });
      await tx.inventoryValuationReversal.deleteMany();
    });
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function warrantyFixture() {
    const customer = await prisma.customer.create({
      data: { phone: `+996703${RUN}`, name: 'Warranty RBAC' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `WR-${RUN}-${Math.random()}`,
        name: 'iPhone',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    const imei = `WR-IMEI-${RUN}-${Math.random()}`;
    const order = await prisma.order.create({
      data: { customerId: customer.id, channel: 'web', status: 'paid', total: 100000 },
    });
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'sold', location: 'BISHKEK-1', orderId: order.id },
    });
    return { customer, imei };
  }

  function customerToken(customerId: string, phone: string) {
    return jwt.sign({ sub: customerId, typ: 'customer', phone });
  }


  /**
   * Приём в гарантию за прилавком был невозможен ни для кого.
   *
   * `POST /warranty` явно отбивал сотрудника:
   * `if (user?.typ === 'staff') throw new ForbiddenException('Используйте staff
   * warranty workflow')` — а такого workflow не существует: единственный маршрут
   * создания в системе этот. Право `warranty:create` в casbin отсутствовало
   * вовсе, у ролей были только `read` и `transition`.
   *
   * Клиент при этом тоже не мог: вход по SMS отключён (`DisabledOtpSender`), а
   * гостевая capability выдаётся при оформлении заказа, не при визите в магазин.
   *
   * Итог: человек приносит сломанный телефон, продавец видит консоль гарантий,
   * видит кнопки «Одобрить ремонт» и «Отремонтировано» — и не может завести
   * заявку, к которой они относятся. Сервисный контур недостижим с обеих сторон.
   */
  it('позволяет продавцу принять устройство в гарантию за прилавком', async () => {
    const { customer, imei } = await warrantyFixture();

    const opened = await request(app.getHttpServer())
      .post('/warranty')
      .set('Authorization', `Bearer ${sellerToken}`)
      .set('Idempotency-Key', `staff-warranty-${RUN}`)
      .send({ customerId: customer.id, imei, problem: 'Не держит заряд' })
      .expect(201);

    expect(opened.body).toMatchObject({ customerId: customer.id, imei });

    // Актор в леджере — принявший сотрудник, а не SYSTEM: иначе нельзя спросить,
    // кто принял устройство у человека.
    const events = await prisma.auditEvent.findMany({ where: { refs: { has: opened.body.id } } });
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((event) => event.actor === sellerId)).toBe(true);

    // Приём — не доступ к консоли. Существующая политика (тест ниже) намеренно
    // держит список и переходы за складом; продавец их не получает. Это
    // сознательное решение, а не побочный эффект правки.
    await request(app.getHttpServer())
      .patch(`/warranty/${opened.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'approved' })
      .expect(403);
  });

  it('курьеру приём в гарантию недоступен', async () => {
    const { customer, imei } = await warrantyFixture();

    await request(app.getHttpServer())
      .post('/warranty')
      .set('Authorization', `Bearer ${courierToken}`)
      .set('Idempotency-Key', `courier-warranty-${RUN}`)
      .send({ customerId: customer.id, imei, problem: 'Не держит заряд' })
      .expect(403);
  });

  it('keeps customer warranty opening public but guards console list/get/transition', async () => {
    const { customer, imei } = await warrantyFixture();
    const otherCustomer = await prisma.customer.create({
      data: { phone: `+996704${RUN}`, name: 'Other Warranty RBAC' },
    });

    const opened = await request(app.getHttpServer())
      .post('/warranty')
      .set('x-guest-capability', issueGuestCheckoutCapability(customer.id))
      .set('Idempotency-Key', 'guest-warranty-once')
      .send({ customerId: customer.id, imei, problem: 'battery' })
      .expect(201);

    const replayed = await request(app.getHttpServer())
      .post('/warranty')
      .set('x-guest-capability', issueGuestCheckoutCapability(customer.id))
      .set('Idempotency-Key', 'guest-warranty-once')
      .send({ customerId: customer.id, imei, problem: 'battery' })
      .expect(201);
    expect(replayed.body.id).toBe(opened.body.id);

    await request(app.getHttpServer())
      .post('/warranty')
      .set('x-guest-capability', issueGuestCheckoutCapability(otherCustomer.id))
      .send({ customerId: customer.id, imei, problem: 'spoofed guest' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/warranty')
      .set('Authorization', `Bearer ${customerToken(otherCustomer.id, otherCustomer.phone)}`)
      .send({ customerId: otherCustomer.id, imei, problem: 'cross-customer imei' })
      .expect(422);

    await request(app.getHttpServer()).get('/warranty?status=created').expect(401);
    await request(app.getHttpServer())
      .get('/warranty?status=created')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/warranty?status=created')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/warranty/${opened.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/warranty/${opened.body.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'received' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/warranty/${opened.body.id}`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ status: 'received' })
      .expect(200);

    await prisma.serviceWorkOrder.create({
      data: { warrantyCaseId: opened.body.id, createdBy: warehouseId, point: 'BISHKEK-1' },
    });
    await request(app.getHttpServer())
      .patch(`/warranty/${opened.body.id}`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ status: 'diagnostics' })
      .expect(422);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'warranty.received' } });
    expect(event?.actor).toBe(warehouseId);
  });
});
