import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { SuppliersModule } from '../src/suppliers/suppliers.module';

describe('Supplier RMA RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
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
        SuppliersModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'seller' | 'warehouse') => {
      const username = `${role}-supplier-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    adminToken = (await createSession('admin')).token;
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
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.approval.deleteMany();
  });

  async function unitFixture() {
    const product = await prisma.product.create({
      data: {
        sku: `SUP-RBAC-${RUN}-${Math.random()}`,
        name: 'iPhone',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    const imei = `SUP-RBAC-IMEI-${RUN}-${Math.random()}`;
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    return imei;
  }

  it('guards supplier master data, RMA operations, scorecard, and staff actors', async () => {
    await request(app.getHttpServer())
      .post('/suppliers')
      .send({ name: 'No token supplier' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ name: 'Seller supplier' })
      .expect(403);

    const supplier = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Supplier RBAC ${RUN}`, contact: '+996700000000' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/suppliers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/suppliers')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/suppliers/scorecard')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/suppliers/scorecard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const imei = await unitFixture();
    await request(app.getHttpServer())
      .post('/suppliers/rma')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ supplierId: supplier.body.id, imei, defect: 'DOA', actor: 'spoof' })
      .expect(403);

    const opened = await request(app.getHttpServer())
      .post('/suppliers/rma')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ supplierId: supplier.body.id, imei, defect: 'DOA', actor: 'spoof' })
      .expect(201);

    const openedEvent = await prisma.auditEvent.findFirst({ where: { type: 'rma.opened' } });
    expect(openedEvent?.actor).toBe(warehouseId);

    await request(app.getHttpServer()).get('/suppliers/rma').expect(401);
    await request(app.getHttpServer())
      .get('/suppliers/rma')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/suppliers/rma')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/suppliers/rma/${opened.body.id}/transition`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ to: 'shipped', actor: 'spoof' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/suppliers/rma/${opened.body.id}/transition`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ to: 'shipped', actor: 'spoof' })
      .expect(200);

    const shippedEvent = await prisma.auditEvent.findFirst({ where: { type: 'rma.shipped' } });
    expect(shippedEvent?.actor).toBe(warehouseId);
  });
});
