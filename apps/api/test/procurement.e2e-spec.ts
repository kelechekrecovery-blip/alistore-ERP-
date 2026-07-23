import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditModule } from '../src/audit/audit.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProcurementModule } from '../src/procurement/procurement.module';
import { FinanceModule } from '../src/finance/finance.module';
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
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuditModule, StaffAuthModule, ProcurementModule, FinanceModule],
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
    await prisma.landedCostAllocation.deleteMany();
    await prisma.landedCost.deleteMany();
    await prisma.supplierStatementLine.deleteMany();
    await prisma.supplierStatement.deleteMany();
    await prisma.supplierInvoiceAdvanceAllocation.deleteMany();
    await prisma.supplierAdvance.deleteMany();
    await prisma.supplierInvoicePayment.deleteMany();
    await prisma.supplierCreditNote.deleteMany();
    await prisma.supplierInvoice.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.$transaction(async (tx) => {
      await tx.inventoryValuationReversal.deleteMany();
      await tx.inventoryValuationIssue.deleteMany();
    });
    await prisma.inventoryValuationLayer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.inventoryQuarantineCase.deleteMany();
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
    // Второй счёт на ту же поставку с другим номером и ключом. Трёхсторонний
    // матч сравнивал счёт с принятой стоимостью и не сверял с уже
    // выставленными, а уникальности по PO в схеме нет — только по паре
    // поставщик+номер. Обе поставки оплачивались, счёт 2000 уходил в дебет
    // дважды, и сверка выписки принимала каждую проводку как законную.
    await request(app.getHttpServer())
      .post('/procurement/supplier-invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...invoicePayload,
        invoiceNumber: `${invoicePayload.invoiceNumber}-DUP`,
        idempotencyKey: `${invoicePayload.idempotencyKey}-dup`,
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('supplier_invoice_over_receipt'));
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

  it('supports replay-safe partial supplier payments and reflects the remaining AP balance', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `create-${RUN}-partial-payment`, supplierId: supplier.id, location: 'BISHKEK-1', items: [{ productId: product.id, qty: 1, unitCost: 70000 }] })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/purchase-orders/${created.body.id}/send`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-partial-payment`, lines: [{ itemId: created.body.items[0].id, imeis: [`PO-PARTIAL-${RUN}`] }] })
      .expect(201);

    const invoice = await request(app.getHttpServer())
      .post('/procurement/supplier-invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `invoice-${RUN}-partial-payment`, invoiceNumber: `INV-${RUN}-PARTIAL`, supplierId: supplier.id, purchaseOrderId: created.body.id, amount: 70000 })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/supplier-invoices/${invoice.body.id}/approve`).set('Authorization', `Bearer ${adminToken}`).expect(201);

    const firstPayload = { idempotencyKey: `invoice-payment-${RUN}-1`, paymentKey: `supplier-bank-${RUN}-partial-1`, amount: 30000, paymentAccountCode: '1010', paymentReference: 'BANK-PARTIAL-1' };
    const first = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstPayload)
      .expect(201);
    expect(first.body).toMatchObject({ id: invoice.body.id, status: 'partially_paid', payment: { amount: 30000 }, idempotent: false });

    const replay = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstPayload)
      .expect(201);
    expect(replay.body).toMatchObject({ id: invoice.body.id, status: 'partially_paid', payment: { amount: 30000 }, idempotent: true });
    await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...firstPayload, amount: 31000 })
      .expect(409);

    const second = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `invoice-payment-${RUN}-2`, paymentKey: `supplier-bank-${RUN}-partial-2`, amount: 40000, paymentAccountCode: '1020', paymentReference: 'CARD-FINAL' })
      .expect(201);
    expect(second.body).toMatchObject({ id: invoice.body.id, status: 'paid', payment: { amount: 40000 }, idempotent: false });
    expect(await prisma.supplierInvoicePayment.count({ where: { invoiceId: invoice.body.id } })).toBe(2);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'supplier.invoice.payment', sourceRef: { startsWith: invoice.body.id } } })).toBe(2);

    const aging = await request(app.getHttpServer())
      .get('/finance/ap-aging')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(aging.body.rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: invoice.body.id, paidAmount: 70000, outstanding: 0 })]));
    expect(aging.body.totalOutstanding).toBe(0);
  });

  it('records supplier advances and applies them to an invoice exactly once', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `create-${RUN}-advance`, supplierId: supplier.id, location: 'BISHKEK-1', items: [{ productId: product.id, qty: 1, unitCost: 70000 }] })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/purchase-orders/${created.body.id}/send`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-advance`, lines: [{ itemId: created.body.items[0].id, imeis: [`PO-ADVANCE-${RUN}`] }] })
      .expect(201);

    const invoice = await request(app.getHttpServer())
      .post('/procurement/supplier-invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `invoice-${RUN}-advance`, invoiceNumber: `INV-${RUN}-ADVANCE`, supplierId: supplier.id, purchaseOrderId: created.body.id, amount: 70000 })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/supplier-invoices/${invoice.body.id}/approve`).set('Authorization', `Bearer ${adminToken}`).expect(201);

    const advancePayload = {
      idempotencyKey: `advance-${RUN}`,
      paymentKey: `supplier-advance-bank-${RUN}`,
      supplierId: supplier.id,
      amount: 70000,
      paymentAccountCode: '1010',
      paymentReference: 'ADVANCE-BANK-1',
    };
    const advance = await request(app.getHttpServer())
      .post('/procurement/supplier-advances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(advancePayload)
      .expect(201);
    expect(advance.body).toMatchObject({ supplierId: supplier.id, amount: 70000, appliedAmount: 0, status: 'open', idempotent: false });
    const advanceEntry = await prisma.accountingJournalEntry.findUniqueOrThrow({ where: { id: advance.body.accountingEntryId }, include: { lines: true } });
    expect(advanceEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1300', debit: 70000, credit: 0 }),
      expect.objectContaining({ accountCode: '1010', debit: 0, credit: 70000 }),
    ]));

    const advanceReplay = await request(app.getHttpServer())
      .post('/procurement/supplier-advances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(advancePayload)
      .expect(201);
    expect(advanceReplay.body).toMatchObject({ id: advance.body.id, idempotent: true });
    await request(app.getHttpServer())
      .post('/procurement/supplier-advances')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...advancePayload, amount: 70001 })
      .expect(409);

    const firstApplyPayload = { idempotencyKey: `advance-apply-${RUN}-1`, invoiceId: invoice.body.id, amount: 30000 };
    const firstApply = await request(app.getHttpServer())
      .post(`/procurement/supplier-advances/${advance.body.id}/apply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstApplyPayload)
      .expect(201);
    expect(firstApply.body).toMatchObject({ idempotent: false, advance: { status: 'partially_applied', appliedAmount: 30000 }, invoice: { status: 'partially_paid' }, allocation: { amount: 30000 } });

    const firstApplyReplay = await request(app.getHttpServer())
      .post(`/procurement/supplier-advances/${advance.body.id}/apply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstApplyPayload)
      .expect(201);
    expect(firstApplyReplay.body).toMatchObject({ idempotent: true, allocation: { id: firstApply.body.allocation.id, amount: 30000 } });
    await request(app.getHttpServer())
      .post(`/procurement/supplier-advances/${advance.body.id}/apply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...firstApplyPayload, amount: 31000 })
      .expect(409);

    const secondApply = await request(app.getHttpServer())
      .post(`/procurement/supplier-advances/${advance.body.id}/apply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `advance-apply-${RUN}-2`, invoiceId: invoice.body.id, amount: 40000 })
      .expect(201);
    expect(secondApply.body).toMatchObject({ idempotent: false, advance: { status: 'applied', appliedAmount: 70000 }, invoice: { status: 'paid' }, allocation: { amount: 40000 } });
    expect(await prisma.supplierInvoiceAdvanceAllocation.count({ where: { advanceId: advance.body.id } })).toBe(2);
    expect(await prisma.accountingJournalEntry.count({ where: { sourceType: 'supplier.advance.applied', sourceRef: { startsWith: advance.body.id } } })).toBe(2);
    const applyEntry = await prisma.accountingJournalEntry.findUniqueOrThrow({ where: { id: secondApply.body.allocation.accountingEntryId }, include: { lines: true } });
    expect(applyEntry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '2000', debit: 40000, credit: 0 }),
      expect.objectContaining({ accountCode: '1300', debit: 0, credit: 40000 }),
    ]));

    const listed = await request(app.getHttpServer())
      .get(`/procurement/supplier-advances?supplierId=${supplier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: advance.body.id, status: 'applied', appliedAmount: 70000, allocations: expect.arrayContaining([expect.objectContaining({ invoice: expect.objectContaining({ id: invoice.body.id }) })]) })]));

    const aging = await request(app.getHttpServer())
      .get('/finance/ap-aging')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(aging.body.rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: invoice.body.id, paidAmount: 0, advanceApplied: 70000, outstanding: 0 })]));
    expect(aging.body.totalAdvanceApplied).toBe(70000);
    expect(await prisma.auditEvent.count({ where: { type: 'supplier.advance.created', refs: { has: advance.body.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'supplier.advance.applied', refs: { has: advance.body.id } } })).toBe(2);
  });

  it('reconciles a supplier statement line to the exact AP payment journal once', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `create-${RUN}-statement`, supplierId: supplier.id, location: 'BISHKEK-1', items: [{ productId: product.id, qty: 1, unitCost: 70000 }] })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/purchase-orders/${created.body.id}/send`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    const receipt = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-statement`, lines: [{ itemId: created.body.items[0].id, imeis: [`PO-STATEMENT-${RUN}`] }] })
      .expect(201);
    const invoice = await request(app.getHttpServer())
      .post('/procurement/supplier-invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `invoice-${RUN}-statement`, invoiceNumber: `INV-${RUN}-STATEMENT`, supplierId: supplier.id, purchaseOrderId: created.body.id, amount: 70000 })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/supplier-invoices/${invoice.body.id}/approve`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    const payment = await request(app.getHttpServer())
      .post(`/procurement/supplier-invoices/${invoice.body.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `invoice-payment-${RUN}-statement`, paymentKey: `supplier-bank-${RUN}-statement`, amount: 30000, paymentAccountCode: '1010', paymentReference: 'STATEMENT-PAYMENT' })
      .expect(201);
    const paymentEntryId = payment.body.payment.accountingEntryId as string;
    const receiptRow = await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.body.receiptId }, select: { accountingEntryId: true } });

    const now = new Date();
    const statementPayload = {
      idempotencyKey: `supplier-statement-${RUN}`,
      statementNumber: `SUPPLIER-STATEMENT-${RUN}`,
      supplierId: supplier.id,
      periodStart: new Date(now.getTime() - 86_400_000).toISOString(),
      periodEnd: new Date(now.getTime() + 86_400_000).toISOString(),
      openingBalance: 100_000,
      closingBalance: 70_000,
      lines: [{ externalId: `supplier-line-${RUN}`, occurredAt: now.toISOString(), amount: -30_000, reference: 'STATEMENT-PAYMENT' }],
    };
    await request(app.getHttpServer()).post('/procurement/supplier-statements').expect(401);
    const imported = await request(app.getHttpServer())
      .post('/procurement/supplier-statements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(statementPayload)
      .expect(201);
    expect(imported.body).toMatchObject({ supplierId: supplier.id, statementNumber: statementPayload.statementNumber, status: 'imported', idempotent: false });
    const importedReplay = await request(app.getHttpServer()).post('/procurement/supplier-statements').set('Authorization', `Bearer ${adminToken}`).send(statementPayload).expect(201);
    expect(importedReplay.body).toMatchObject({ id: imported.body.id, idempotent: true });
    const lineId = imported.body.lines[0].id as string;

    await request(app.getHttpServer())
      .post(`/procurement/supplier-statements/lines/${lineId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `supplier-reconcile-${RUN}-wrong`, journalEntryId: receiptRow.accountingEntryId })
      .expect(409);
    const matched = await request(app.getHttpServer())
      .post(`/procurement/supplier-statements/lines/${lineId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `supplier-reconcile-${RUN}`, journalEntryId: paymentEntryId })
      .expect(201);
    expect(matched.body).toMatchObject({ status: 'matched', statement: { status: 'reconciled' }, matchedEntry: { id: paymentEntryId }, idempotent: false });
    const replay = await request(app.getHttpServer())
      .post(`/procurement/supplier-statements/lines/${lineId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `supplier-reconcile-${RUN}`, journalEntryId: paymentEntryId })
      .expect(201);
    expect(replay.body).toMatchObject({ id: lineId, idempotent: true, matchedEntryId: paymentEntryId });
    await request(app.getHttpServer())
      .post(`/procurement/supplier-statements/lines/${lineId}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `supplier-reconcile-${RUN}`, journalEntryId: receiptRow.accountingEntryId })
      .expect(409);

    const listed = await request(app.getHttpServer())
      .get(`/procurement/supplier-statements?supplierId=${supplier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: imported.body.id, status: 'reconciled', lines: expect.arrayContaining([expect.objectContaining({ id: lineId, matchedEntry: expect.objectContaining({ id: paymentEntryId }) })]) })]));
    expect(await prisma.auditEvent.count({ where: { type: 'supplier.statement.line_reconciled', refs: { has: lineId } } })).toBe(1);
  });

  it('capitalizes landed cost across received units exactly once', async () => {
    const { supplier, product } = await fixture();
    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ idempotencyKey: `create-${RUN}-landed`, supplierId: supplier.id, location: 'BISHKEK-1', items: [{ productId: product.id, qty: 2, unitCost: 70000 }] })
      .expect(201);
    await request(app.getHttpServer()).post(`/procurement/purchase-orders/${created.body.id}/send`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ idempotencyKey: `receipt-${RUN}-landed`, lines: [{ itemId: created.body.items[0].id, imeis: [`PO-LANDED-${RUN}-1`, `PO-LANDED-${RUN}-2`] }] })
      .expect(201);

    const payload = {
      idempotencyKey: `landed-${RUN}`,
      documentNumber: `FREIGHT-${RUN}`,
      purchaseOrderId: created.body.id,
      amount: 10000,
      creditAccountCode: '2000',
      description: 'Доставка партии до склада',
    };
    await request(app.getHttpServer()).post('/procurement/landed-costs').expect(401);
    await request(app.getHttpServer()).post('/procurement/landed-costs').set('Authorization', `Bearer ${sellerToken}`).send(payload).expect(403);
    const applied = await request(app.getHttpServer())
      .post('/procurement/landed-costs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(applied.body).toMatchObject({ purchaseOrderId: created.body.id, supplierId: supplier.id, amount: 10000, creditAccountCode: '2000', idempotent: false });
    expect(applied.body.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ imei: `PO-LANDED-${RUN}-1`, baseCost: 70000, allocatedAmount: 5000, resultingCost: 75000 }),
      expect.objectContaining({ imei: `PO-LANDED-${RUN}-2`, baseCost: 70000, allocatedAmount: 5000, resultingCost: 75000 }),
    ]));
    const replay = await request(app.getHttpServer()).post('/procurement/landed-costs').set('Authorization', `Bearer ${adminToken}`).send(payload).expect(201);
    expect(replay.body).toMatchObject({ id: applied.body.id, idempotent: true });
    await request(app.getHttpServer()).post('/procurement/landed-costs').set('Authorization', `Bearer ${adminToken}`).send({ ...payload, amount: 10001 }).expect(409);

    const units = await prisma.deviceUnit.findMany({ where: { imei: { startsWith: `PO-LANDED-${RUN}` } }, orderBy: { imei: 'asc' } });
    expect(units.map((unit) => unit.acquisitionCost)).toEqual([75000, 75000]);
    const entry = await prisma.accountingJournalEntry.findUniqueOrThrow({ where: { id: applied.body.accountingEntryId }, include: { lines: true, landedCost: true } });
    expect(entry.sourceType).toBe('procurement.landed-cost');
    expect(entry.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1200', debit: 10000, credit: 0 }),
      expect.objectContaining({ accountCode: '2000', debit: 0, credit: 10000 }),
    ]));
    expect(entry.landedCost?.supplierId).toBe(supplier.id);
    expect(await prisma.inventoryMovement.count({ where: { reason: `${payload.documentNumber}:landed-cost`, totalValue: 10000 } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'procurement.landed_cost.applied', refs: { has: applied.body.id } } })).toBe(1);
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

  it('отказывает в приёмке по IMEI для количественного товара', async () => {
    // Импорт из Excel без колонки «тип учёта» заводит товар количественным
    // (import.service.ts:96 — сознательно, чтобы аксессуары не уходили в
    // IMEI-учёт). Приёмка при этом на тип учёта не смотрела и создавала
    // серийные единицы, которых не видит ни одна витрина: наличие для
    // количественного товара читается из StockBalance, а его приёмка не пишет.
    // Товар принят, склад пуст, ошибки нигде — это и надо поймать здесь.
    const supplier = await prisma.supplier.create({ data: { name: `Qty Supplier ${RUN}-${Math.random()}` } });
    const product = await prisma.product.create({
      data: {
        sku: `PO-QTY-${RUN}-${Math.random()}`,
        name: 'Кабель USB-C',
        price: 900,
        cost: 400,
        category: 'accessories',
        trackingMode: 'quantity',
        attrs: {},
      },
    });

    const created = await request(app.getHttpServer())
      .post('/procurement/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: `qty-${RUN}-${Math.random()}`,
        supplierId: supplier.id,
        location: 'BISHKEK-1',
        items: [{ productId: product.id, qty: 1, unitCost: 400 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${created.body.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        idempotencyKey: `qty-recv-${RUN}-${Math.random()}`,
        lines: [{ itemId: created.body.items[0].id, imeis: ['356938035999001'] }],
      })
      .expect(422);

    expect(rejected.body.code).toBe('product_not_serialized');
    // И главное — молчаливых единиц не осталось.
    expect(await prisma.deviceUnit.count({ where: { productId: product.id } })).toBe(0);
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
