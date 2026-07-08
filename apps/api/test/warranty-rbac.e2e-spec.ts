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

describe('Warranty console RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let jwt: JwtService;
  let sellerToken: string;
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

    const createSession = async (role: 'seller' | 'warehouse') => {
      const username = `${role}-warranty-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

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
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'sold', location: 'BISHKEK-1' },
    });
    return { customer, imei };
  }

  function customerToken(customerId: string, phone: string) {
    return jwt.sign({ sub: customerId, typ: 'customer', phone });
  }

  it('keeps customer warranty opening public but guards console list/get/transition', async () => {
    const { customer, imei } = await warrantyFixture();
    const otherCustomer = await prisma.customer.create({
      data: { phone: `+996704${RUN}`, name: 'Other Warranty RBAC' },
    });

    const opened = await request(app.getHttpServer())
      .post('/warranty')
      .send({ customerId: customer.id, imei, problem: 'battery' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/warranty')
      .set('Authorization', `Bearer ${customerToken(customer.id, customer.phone)}`)
      .send({ customerId: customer.id, imei, problem: 'screen' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/warranty')
      .set('Authorization', `Bearer ${customerToken(otherCustomer.id, otherCustomer.phone)}`)
      .send({ customerId: customer.id, imei, problem: 'spoof' })
      .expect(403);

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

    const event = await prisma.auditEvent.findFirst({ where: { type: 'warranty.received' } });
    expect(event?.actor).toBe(warehouseId);
  });
});
