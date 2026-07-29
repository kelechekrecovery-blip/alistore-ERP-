import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupplierPriceImportModule } from '../src/procurement/price-import/supplier-price-import.module';

/**
 * Слайс 4 плана docs/SUPPLY-TO-ORDER-PLAN.md — импорт прайс-листа поставщика.
 *
 * Основной путь поставки данных у партнёров в Бишкеке: таблица без API. Импорт
 * двухшаговый — stage (парсинг + классификация, ничего не пишет в Product) →
 * apply (явное решение сотрудника, пишет cost/supplyLeadDays/supplierId и
 * ledger-события). Один и тот же батч применить дважды нельзя.
 */
describe('Supplier price-list import', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let warehouseToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StaffAuthModule,
        SupplierPriceImportModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const createSession = async (role: 'admin' | 'warehouse') => {
      const username = `${role}-spi-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      const token = (await staffAuth.login(username, 'pass')).accessToken;
      return { id: staff.id, token };
    };

    const admin = await createSession('admin');
    adminToken = admin.token;
    warehouseToken = (await createSession('warehouse')).token;
  });

  afterAll(async () => {
    const batches = await prisma.supplierPriceImportBatch.findMany({
      where: { supplier: { name: { startsWith: `SPI-Supplier-${RUN}` } } },
      select: { id: true },
    });
    const batchIds = batches.map((b) => b.id);
    if (batchIds.length) {
      await prisma.supplierPriceImportApplication.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.supplierPriceImportBatch.deleteMany({ where: { id: { in: batchIds } } });
    }
    const products = await prisma.product.findMany({
      where: { sku: { startsWith: `SPI-${RUN}` } },
      select: { id: true },
    });
    const productIds = products.map((p) => p.id);
    if (productIds.length) {
      await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await prisma.supplier.deleteMany({ where: { name: { startsWith: `SPI-Supplier-${RUN}` } } });
    await app.close();
  });

  async function xlsx(header: (string | number)[], rows: (string | number)[][]): Promise<Buffer> {
    const wb = new Workbook();
    const ws = wb.addWorksheet('pricelist');
    ws.addRow(header);
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function supplier(name: string) {
    return prisma.supplier.create({ data: { name } });
  }

  async function product(data: Record<string, unknown>) {
    return prisma.product.create({
      data: {
        name: 'Тестовый товар',
        price: 150000,
        cost: 90000,
        category: 'phones',
        attrs: {},
        ...data,
      } as never,
    });
  }

  const mapping = JSON.stringify({ sku: 'Артикул', price: 'Цена', leadDays: 'Срок' });

  describe('RBAC', () => {
    it('401 anonymous cannot stage a batch', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-rbac1`);
      const buf = await xlsx(['Артикул', 'Цена', 'Срок'], [[`SPI-${RUN}-RBAC`, 1000, 5]]);
      await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(401);
    });

    it('403 warehouse role cannot stage a batch (products:update is admin/owner only)', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-rbac2`);
      const buf = await xlsx(['Артикул', 'Цена', 'Срок'], [[`SPI-${RUN}-RBAC2`, 1000, 5]]);
      await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${warehouseToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(403);
    });
  });

  describe('preview classification', () => {
    it('classifies price change, lead-time change, no-change, unmatched and ambiguous rows; never lands a price on Product.price', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-cls`);
      const priceChangeProduct = await product({ sku: `SPI-${RUN}-PRICE`, cost: 80000, price: 150000 });
      const noChangeProduct = await product({ sku: `SPI-${RUN}-SAME`, cost: 50000, price: 90000 });
      const leadTimeProduct = await product({
        sku: `SPI-${RUN}-LEAD`,
        cost: 30000,
        price: 60000,
        supplyMode: 'to_order',
        supplyLeadDays: 10,
      });
      const dupTarget = await product({ sku: `SPI-${RUN}-DUP`, cost: 10000, price: 20000 });

      const buf = await xlsx(
        ['Артикул', 'Цена', 'Срок'],
        [
          [`SPI-${RUN}-PRICE`, 85000, ''],
          [`SPI-${RUN}-SAME`, 50000, ''],
          [`SPI-${RUN}-LEAD`, 30000, 12],
          [`SPI-${RUN}-DUP`, 11000, ''],
          [`SPI-${RUN}-DUP`, 12000, ''], // duplicate SKU in the same file → ambiguous
          [`SPI-${RUN}-GHOST`, 5000, ''], // no such product → unmatched
        ],
      );

      const res = await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(201);

      const rows: Array<Record<string, unknown>> = res.body.rows;
      const bySku = (sku: string) => rows.filter((r) => r.sku === sku);

      const priceRow = bySku(`SPI-${RUN}-PRICE`)[0];
      expect(priceRow.type).toBe('price_change');
      expect(priceRow.matchedProductId).toBe(priceChangeProduct.id);
      expect(priceRow.oldCost).toBe(80000);
      expect(priceRow.newCost).toBe(85000);
      expect(priceRow.deltaCost).toBe(5000);

      const sameRow = bySku(`SPI-${RUN}-SAME`)[0];
      expect(sameRow.type).toBe('no_change');
      expect(sameRow.matchedProductId).toBe(noChangeProduct.id);

      const leadRow = bySku(`SPI-${RUN}-LEAD`)[0];
      expect(leadRow.type).toBe('lead_time_change');
      expect(leadRow.matchedProductId).toBe(leadTimeProduct.id);
      expect(leadRow.oldLeadDays).toBe(10);
      expect(leadRow.newLeadDays).toBe(12);

      const dupRows = bySku(`SPI-${RUN}-DUP`);
      expect(dupRows).toHaveLength(2);
      expect(dupRows.every((r) => r.type === 'ambiguous')).toBe(true);
      expect(dupTarget.id).toBeTruthy();

      const ghostRow = bySku(`SPI-${RUN}-GHOST`)[0];
      expect(ghostRow.type).toBe('unmatched');
      expect(ghostRow.matchedProductId).toBeNull();

      expect(res.body.summary).toMatchObject({
        total: 6,
        priceChange: 1,
        leadTimeChange: 1,
        noChange: 1,
        ambiguous: 2,
        unmatched: 1,
      });

      // Money invariant: a supplier's price is COST, never touches our selling price.
      const untouched = await prisma.product.findUnique({ where: { id: priceChangeProduct.id } });
      expect(untouched?.price).toBe(150000);
      expect(untouched?.cost).toBe(80000); // preview must not have written anything yet
    });

    it('rejects a non-integer price ("12 500,50") explicitly instead of silently rounding', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-money`);
      await product({ sku: `SPI-${RUN}-MONEY`, cost: 1000, price: 2000 });
      const buf = await xlsx(['Артикул', 'Цена', 'Срок'], [[`SPI-${RUN}-MONEY`, '12 500,50', '']]);

      const res = await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(201);

      const row = res.body.rows[0];
      expect(row.type).toBe('invalid');
      expect(row.error).toBeTruthy();
      expect(res.body.summary.invalid).toBe(1);

      // A thousand-separated whole number normalises fine.
      const buf2 = await xlsx(['Артикул', 'Цена', 'Срок'], [[`SPI-${RUN}-MONEY`, '12 500', '']]);
      const res2 = await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf2, 'list.xlsx')
        .expect(201);
      expect(res2.body.rows[0].type).toBe('price_change');
      expect(res2.body.rows[0].newCost).toBe(12500);
    });
  });

  describe('apply', () => {
    it('writes exactly what preview promised, is idempotent on double-apply, and appends ledger events', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-apply`);
      const p1 = await product({ sku: `SPI-${RUN}-A1`, cost: 40000, price: 70000 });
      const p2 = await product({
        sku: `SPI-${RUN}-A2`,
        cost: 20000,
        price: 35000,
        supplyMode: 'to_order',
        supplyLeadDays: 3,
      });

      const buf = await xlsx(
        ['Артикул', 'Цена', 'Срок'],
        [
          [`SPI-${RUN}-A1`, 42000, ''],
          [`SPI-${RUN}-A2`, 20000, 9],
        ],
      );
      const staged = await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(201);
      const batchId = staged.body.batchId as string;

      const applied = await request(app.getHttpServer())
        .post(`/procurement/price-imports/${batchId}/apply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(applied.body.idempotent).toBe(false);
      expect(applied.body.applied).toBe(2);

      const updated1 = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
      const updated2 = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
      expect(updated1.cost).toBe(42000);
      expect(updated1.price).toBe(70000); // selling price untouched
      expect(updated1.supplierId).toBe(s.id);
      expect(updated2.cost).toBe(20000); // unchanged cost still gets supplierId linked
      expect(updated2.supplyLeadDays).toBe(9);
      expect(updated2.supplierId).toBe(s.id);

      const events = await prisma.auditEvent.findMany({
        where: { refs: { hasSome: [p1.id, p2.id, batchId] } },
        orderBy: { ts: 'asc' },
      });
      const costEvent = events.find((e) => e.type === 'product.cost_changed' && e.refs.includes(p1.id));
      expect(costEvent).toBeTruthy();
      expect((costEvent!.payload as Record<string, unknown>).from).toBe(40000);
      expect((costEvent!.payload as Record<string, unknown>).to).toBe(42000);
      const batchEvent = events.find((e) => e.type === 'supplier_price_import.applied');
      expect(batchEvent).toBeTruthy();
      const eventCountAfterFirstApply = events.length;

      // Double apply: no-op, no new events, no double-write.
      const appliedAgain = await request(app.getHttpServer())
        .post(`/procurement/price-imports/${batchId}/apply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(appliedAgain.body.idempotent).toBe(true);

      const eventsAfterSecondApply = await prisma.auditEvent.findMany({
        where: { refs: { hasSome: [p1.id, p2.id, batchId] } },
      });
      expect(eventsAfterSecondApply).toHaveLength(eventCountAfterFirstApply);

      const stillUpdated1 = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
      expect(stillUpdated1.cost).toBe(42000);

      const applications = await prisma.supplierPriceImportApplication.findMany({ where: { batchId } });
      expect(applications).toHaveLength(1);
    });

    it('never applies unmatched or ambiguous rows, and reports them instead of dropping them', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-unmatched`);
      await product({ sku: `SPI-${RUN}-U-DUP`, cost: 1000, price: 2000 });
      const buf = await xlsx(
        ['Артикул', 'Цена', 'Срок'],
        [
          [`SPI-${RUN}-U-GHOST`, 5000, ''],
          [`SPI-${RUN}-U-DUP`, 1100, ''],
          [`SPI-${RUN}-U-DUP`, 1200, ''],
        ],
      );
      const staged = await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(201);

      expect(staged.body.summary.unmatched).toBe(1);
      expect(staged.body.summary.ambiguous).toBe(2);

      const applied = await request(app.getHttpServer())
        .post(`/procurement/price-imports/${staged.body.batchId}/apply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(applied.body.applied).toBe(0);
      expect(applied.body.unmatched).toBe(1);
      expect(applied.body.ambiguous).toBe(2);
    });
  });

  describe('mapping reuse', () => {
    it('reuses the last stored mapping for the same supplier when none is given', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-reuse`);
      await product({ sku: `SPI-${RUN}-REUSE`, cost: 1000, price: 2000 });
      const buf = await xlsx(['Артикул', 'Цена', 'Срок'], [[`SPI-${RUN}-REUSE`, 1500, '']]);
      await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .field('mapping', mapping)
        .attach('file', buf, 'list.xlsx')
        .expect(201);

      const buf2 = await xlsx(['Артикул', 'Цена', 'Срок'], [[`SPI-${RUN}-REUSE`, 1600, '']]);
      const res2 = await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .attach('file', buf2, 'list.xlsx')
        .expect(201);
      expect(res2.body.rows[0].newCost).toBe(1600);
      expect(res2.body.rows[0].type).toBe('price_change');
    });

    it('422 when no mapping is given and none exists yet for the supplier', async () => {
      const s = await supplier(`SPI-Supplier-${RUN}-nomapping`);
      const buf = await xlsx(['Артикул', 'Цена'], [[`SPI-${RUN}-NM`, 1000]]);
      await request(app.getHttpServer())
        .post('/procurement/price-imports')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('supplierId', s.id)
        .attach('file', buf, 'list.xlsx')
        .expect(422);
    });
  });
});
