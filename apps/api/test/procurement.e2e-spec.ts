import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProcurementModule } from '../src/procurement/procurement.module';
import { StaffAuthModule } from '../src/staff-auth/staff-auth.module';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Purchase order procurement (integration + RBAC)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffAuth: StaffAuthService;
  let adminToken: string;
  let adminId: string;
  let warehouseToken: string;
  let warehouseId: string;
  let sellerToken: string;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, ProcurementModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffAuth = moduleRef.get(StaffAuthService);

    const session = async (role: 'admin' | 'warehouse' | 'seller') => {
      const username = `${role}-procurement-${RUN}`;
      const staff = await staffAuth.createStaff(username, 'pass', role);
      return { id: staff.id, token: (await staffAuth.login(username, 'pass')).accessToken };
    };
    const admin = await session('admin');
    adminId = admin.id;
    adminToken = admin.token;
    const warehouse = await session('warehouse');
    warehouseId = warehouse.id;
    warehouseToken = warehouse.token;
    sellerToken = (await session('seller')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  async function cleanFixtures() {
    await prisma.auditEvent.deleteMany();
    await prisma.supplierCreditNote.deleteMany();
    await prisma.supplierInvoice.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
  }

  beforeEach(async () => {
    await cleanFixtures();
  });

  afterEach(async () => {
    await cleanFixtures();
  });

  async function fixture() {
    const supplier = await prisma.supplier.create({ data: { name: `PO Supplier ${RUN}-${Math.random()}` } });
    const product = await prisma.product.create({
      data: { sku: `PO-SKU-${RUN}-${Math.random()}`, name: 'iPhone PO', price: 100000, cost: 70000, category: 'phones', attrs: {} },
    });
    return { supplier, product };
  }

  it('runs draft → sent → partial receiving → received without duplicate stock', async () => {
    const { supplier, product } = await fixture();
    const payload = {
      idempotencyKey: `create-${RUN}-1`,
      supplierId: supplier.id,
      location: 'BISHKEK-1',
      note: 'Claude Design PO flow',
      items: [{ productId: product.id, qty: 2, unitCost: 70000 }],
    };

    await request(app.getHttpServer()).post('/procurement/purchase-orders').send(payload).expect(401);
    await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(payload)
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.items[0]).toMatchObject({ orderedQty: 2, receivedQty: 0, unitCost: 70000 });
    expect((await prisma.auditEvent.findFirst({ where: { type: 'purchase_order.created' } }))?.actor).toBe(adminId);

    const createReplay = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(createReplay.body).toMatchObject({ id: created.body.id, idempotent: true });
    expect(await prisma.purchaseOrder.count()).toBe(1);
    await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, location: 'OSH-1' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('sent'));

    const itemId = created.body.items[0].id as string;
    const partialPayload = { idempotencyKey: `receipt-${RUN}-1`, lines: [{ itemId, imeis: [`PO-IMEI-${RUN}-1`], grade: 'A' }] };
    const partial = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(partialPayload)
      .expect(201);
    expect(partial.body).toMatchObject({ status: 'receiving', idempotent: false });
    expect(partial.body.items[0].receivedQty).toBe(1);
    const partialReceipt = await prisma.purchaseReceipt.findUnique({ where: { id: partial.body.receiptId } });
    expect(partialReceipt?.accountingEntryId).toBeTruthy();
    const partialEntry = await prisma.accountingJournalEntry.findUnique({ where: { id: partialReceipt?.accountingEntryId ?? '' }, include: { lines: true } });
    expect(partialEntry?.sourceType).toBe('procurement.receipt');
    expect(partialEntry?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1200', debit: 70000 }),
      expect.objectContaining({ accountCode: '2000', credit: 70000 }),
    ]));

    const replay = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send(partialPayload)
      .expect(201);
    expect(replay.body.idempotent).toBe(true);
    expect(await prisma.deviceUnit.count({ where: { productId: product.id } })).toBe(1);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ ...partialPayload, lines: [{ itemId, imeis: [`PO-IMEI-${RUN}-different`] }] })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-over`, lines: [{ itemId, imeis: [`PO-IMEI-${RUN}-2`, `PO-IMEI-${RUN}-3`] }] })
      .expect(409);

    const completed = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-2`, lines: [{ itemId, imeis: [`PO-IMEI-${RUN}-2`], grade: 'A' }] })
      .expect(201);
    expect(completed.body).toMatchObject({ status: 'received', idempotent: false });
    expect(completed.body.items[0].receivedQty).toBe(2);
    expect(await prisma.deviceUnit.count({ where: { productId: product.id, status: 'in_stock' } })).toBe(2);
    expect(await prisma.inventoryMovement.count({ where: { productId: product.id, type: 'received' } })).toBe(2);
    const receiptIds = (await prisma.purchaseReceipt.findMany({ where: { purchaseOrderId: created.body.id }, select: { id: true } })).map((receipt) => receipt.id);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'procurement.receipt', sourceRef: { in: receiptIds } } })).toBe(2);

    const eventTypes = (await prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } })).map((event) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'purchase_order.created',
      'purchase_order.sent',
      'purchase_order.receiving',
      'purchase_order.received',
      'stock.received',
      'unit.received',
    ]));
    expect((await prisma.auditEvent.findFirst({ where: { type: 'purchase_order.received' } }))?.actor).toBe(warehouseId);
  });

  it('allows owner/admin cancellation only before receiving starts', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `create-${RUN}-cancel`, supplierId: supplier.id, location: 'BISHKEK-1', items: [{ productId: product.id, qty: 1, unitCost: 1 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('cancelled'));
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('matches a supplier invoice to received PO value and clears AP only once', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `create-${RUN}-invoice`, supplierId: supplier.id, location: 'BISHKEK-1', items: [{ productId: product.id, qty: 1, unitCost: 70000 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-invoice`, lines: [{ itemId: created.body.items[0].id, imeis: [`PO-INVOICE-${RUN}`] }] })
      .expect(201);

    const invoicePayload = { idempotencyKey: `invoice-${RUN}`, invoiceNumber: `INV-${RUN}`, supplierId: supplier.id, purchaseOrderId: created.body.id, amount: 70000 };
    const invoice = await request(app.getHttpServer())
      .post('/procurement/supplier-invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(invoicePayload)
      .expect(201);
    expect(invoice.body.status).toBe('draft');
    expect((await request(app.getHttpServer()).post('/procurement/supplier-invoices').set('Authorization', `Bearer ${adminToken}`).send(invoicePayload)).body.idempotent).toBe(true);
    await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('approved'));
    const paid = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentKey: `supplier-bank-${RUN}`, paymentAccountCode: '1010', paymentReference: 'BANK-STATEMENT-1' })
      .expect(201);
    expect(paid.body.status).toBe('paid');
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'supplier.invoice.payment', sourceRef: `${invoice.body.id}:supplier-bank-${RUN}` } })).toBe(1);
    const replay = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentKey: `supplier-bank-${RUN}`, paymentAccountCode: '1010', paymentReference: 'BANK-STATEMENT-1' })
      .expect(201);
    expect(replay.body.id).toBe(invoice.body.id);
    const creditPayload = { idempotencyKey: `credit-${RUN}`, noteNumber: `CN-${RUN}`, supplierId: supplier.id, invoiceId: invoice.body.id, amount: 10000, reason: 'Возврат дефектной единицы' };
    const credit = await request(app.getHttpServer())
      .post('/procurement/supplier-credit-notes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(creditPayload)
      .expect(201);
    expect(credit.body.status).toBe('draft');
    await request(app.getHttpServer())
      .post(`/procurement/supplier-credit-notes/${credit.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('approved'));
    const applied = await request(app.getHttpServer())
      .post(`/procurement/supplier-credit-notes/${credit.body.id}/apply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(applied.body.status).toBe('applied');
    const creditEntry = await prisma.accountingJournalEntry.findUniqueOrThrow({ where: { id: applied.body.accountingEntryId }, include: { lines: true } });
    expect(creditEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1100', debit: 10000 }),
      expect.objectContaining({ accountCode: '1200', credit: 10000 }),
    ]));
    expect(await prisma.auditEvent.count({ where: { type: 'supplier.credit_note.applied', refs: { has: credit.body.id } } })).toBe(1);
    await request(app.getHttpServer())
      .post('/procurement/supplier-invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...invoicePayload, idempotencyKey: `invoice-${RUN}-mismatch`, invoiceNumber: `INV-${RUN}-MISMATCH`, amount: 70001 })
      .expect(409);
  });

  it('serializes concurrent receipts so ordered quantity cannot be exceeded', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: `create-${RUN}-race`,
        supplierId: supplier.id,
        location: 'BISHKEK-1',
        items: [{ productId: product.id, qty: 1, unitCost: 70000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const itemId = created.body.items[0].id as string;
    const receive = (suffix: string) => request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({
        idempotencyKey: `receipt-${RUN}-race-${suffix}`,
        lines: [{ itemId, imeis: [`PO-IMEI-${RUN}-race-${suffix}`], grade: 'A' }],
      });

    const results = await Promise.allSettled([receive('a'), receive('b')]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const statuses = results
      .map((result) => result.status === 'fulfilled' ? result.value.status : 500)
      .sort();
    expect(statuses).toEqual([201, 409]);

    const persisted = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { items: true, receipts: true },
    });
    expect(persisted.status).toBe('received');
    expect(persisted.items[0].receivedQty).toBe(1);
    expect(persisted.receipts).toHaveLength(1);
    expect(await prisma.deviceUnit.count({ where: { productId: product.id } })).toBe(1);
  });

  it('rejects stale privileged roles and malformed procurement batches', async () => {
    const { supplier, product } = await fixture();
    const base = {
      supplierId: supplier.id,
      location: 'BISHKEK-1',
      items: [{ productId: product.id, qty: 1, unitCost: 70000 }],
    };

    await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...base, idempotencyKey: `create-${RUN}-blank`, location: '   ' })
      .expect(400);

    await prisma.staffUser.update({ where: { id: adminId }, data: { role: 'warehouse' } });
    try {
      await request(app.getHttpServer())
        .post('/procurement/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...base, idempotencyKey: `create-${RUN}-stale-role` })
        .expect(403);
    } finally {
      await prisma.staffUser.update({ where: { id: adminId }, data: { role: 'admin' } });
    }

    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...base, idempotencyKey: `create-${RUN}-empty-line` })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-empty-line`, lines: [{ itemId: created.body.items[0].id, imeis: ['   '] }] })
      .expect(422);
  });

  it('rejects direct procurement of a virtual bundle', async () => {
    const { supplier, product: component } = await fixture();
    const bundle = await prisma.product.create({
      data: {
        sku: `PO-BUNDLE-${RUN}-${Math.random()}`,
        name: 'Virtual kit',
        price: 90000,
        cost: 0,
        category: 'bundles',
        attrs: {},
        bundleComponents: { create: { componentProductId: component.id, qty: 1 } },
      },
    });

    const response = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: `create-${RUN}-virtual-bundle`,
        supplierId: supplier.id,
        location: 'BISHKEK-1',
        items: [{ productId: bundle.id, qty: 1, unitCost: 70000 }],
      })
      .expect(422);

    expect(response.body.code).toBe('purchase_order_virtual_bundle_forbidden');
    expect(await prisma.purchaseOrder.count()).toBe(0);
  });
});
