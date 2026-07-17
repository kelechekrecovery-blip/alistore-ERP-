import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { ImportModule } from '../src/import/import.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

/**
 * LOGIC-010: POST /import/products rewrites price/cost in bulk, so it is a
 * staff-only dangerous action (products:create) — not open to any customer JWT —
 * and every imported row lands in the append-only Event Ledger
 * (product.created / product.updated / price.changed) in the same transaction.
 */
describe('Import endpoint guard + ledger coverage', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let adminId: string;
  let cashierToken: string;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me' });
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        ImportModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'cashier') => {
      const username = `${role}-import-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminId = admin.id;
    adminToken = admin.token;
    cashierToken = (await createSession('cashier')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.orderBundleAllocation.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
  });

  async function xlsx(rows: (string | number)[][]): Promise<Buffer> {
    const wb = new Workbook();
    const ws = wb.addWorksheet('products');
    ws.addRow(['sku', 'name', 'price', 'cost', 'category']);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  function importReq(token: string | null, file: Buffer) {
    const req = request(app.getHttpServer()).post('/import/products');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.attach('file', file, 'products.xlsx');
  }

  it('refuses anonymous and customer-JWT callers (no staff JWT, no write)', async () => {
    const file = await xlsx([[`IMP-ANON-${RUN}`, 'Phone', 1000, 700, 'phones']]);
    const customer = await prisma.customer.create({
      data: { phone: `+996555${RUN}`, name: 'Import Guard' },
    });
    const customerToken = jwt.sign({ sub: customer.id, typ: 'customer', phone: customer.phone });

    await importReq(null, file).expect(401);
    await importReq(customerToken, file).expect(403);

    expect(await prisma.product.count({ where: { sku: `IMP-ANON-${RUN}` } })).toBe(0);
  });

  it('refuses staff without products:create (cashier)', async () => {
    const file = await xlsx([[`IMP-CASHIER-${RUN}`, 'Phone', 1000, 700, 'phones']]);

    await importReq(cashierToken, file).expect(403);

    expect(await prisma.product.count({ where: { sku: `IMP-CASHIER-${RUN}` } })).toBe(0);
  });

  it('admin import upserts products and appends ledger events per row', async () => {
    const skuNew = `IMP-NEW-${RUN}`;
    const skuUpd = `IMP-UPD-${RUN}`;
    await prisma.product.create({
      data: { sku: skuUpd, name: 'Old name', price: 1000, cost: 700, category: 'phones', attrs: {} },
    });

    const first = await importReq(
      adminToken,
      await xlsx([
        [skuNew, 'Fresh Phone', 5000, 4000, 'phones'],
        [skuUpd, 'Old name', 1000, 700, 'phones'], // unchanged row
      ]),
    ).expect(201);
    expect(first.body).toMatchObject({ created: 1, updated: 0, unchanged: 1, errors: [] });

    const createdEvents = await prisma.auditEvent.findMany({
      where: { type: 'product.created', refs: { has: skuNew } },
    });
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].actor).toBe(adminId);
    expect(createdEvents[0].payload).toMatchObject({ sku: skuNew, price: 5000, cost: 4000 });

    // Re-import with a changed name + price → product.updated + price.changed.
    const second = await importReq(
      adminToken,
      await xlsx([[skuUpd, 'New name', 1200, 700, 'phones']]),
    ).expect(201);
    expect(second.body).toMatchObject({ created: 0, updated: 1, unchanged: 0, errors: [] });

    const updatedEvents = await prisma.auditEvent.findMany({
      where: { type: 'product.updated', refs: { has: skuUpd } },
    });
    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].actor).toBe(adminId);

    const priceEvents = await prisma.auditEvent.findMany({
      where: { type: 'price.changed', refs: { has: skuUpd } },
    });
    expect(priceEvents).toHaveLength(1);
    expect(priceEvents[0].actor).toBe(adminId);
    expect(priceEvents[0].payload).toMatchObject({ from: 1000, to: 1200 });

    const product = await prisma.product.findUniqueOrThrow({ where: { sku: skuUpd } });
    expect(product).toMatchObject({ name: 'New name', price: 1200 });
  });
});
