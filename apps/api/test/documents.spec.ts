import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentsService } from '../src/documents/documents.service';
import { ValidationError } from '../src/common/errors';
import { buildOrderInvoiceLines } from '../src/documents/order-invoice';
import { buildTradeInContractLines } from '../src/documents/trade-in-contract';

/**
 * Trade-in contract PDF (pdf-lib + bundled Cyrillic font) against a real DB row.
 * No global wipe (grown FK-linked schema): unique data per run.
 */
describe('DocumentsService.tradeInContract (integration)', () => {
  let prisma: PrismaService;
  let documents: DocumentsService;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    documents = new DocumentsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('builds order invoice lines with customer, SKU, IMEI, totals and split payments', () => {
    const lines = buildOrderInvoiceLines({
      id: 'order-1',
      status: 'paid',
      channel: 'pos',
      total: 100000,
      createdAt: new Date('2026-07-08T10:30:00.000Z'),
      customer: { name: 'Нурлан', phone: '+996700000000' },
      items: [
        { sku: 'SKU-1', name: 'iPhone 15', qty: 1, price: 100000, imei: 'IMEI-123' },
      ],
      payments: [
        { method: 'cash', amount: 30000, status: 'received' },
        { method: 'card', amount: 70000, status: 'received' },
      ],
    });

    expect(lines.join('\n')).toContain('НАКЛАДНАЯ');
    expect(lines.join('\n')).toContain('Нурлан · тел. +996700000000');
    expect(lines.join('\n')).toContain('iPhone 15 (SKU SKU-1)');
    expect(lines.join('\n')).toContain('IMEI / SN: IMEI-123');
    expect(lines.join('\n')).toContain('Итого: 100 000 сом');
    expect(lines.join('\n')).toContain('cash: 30 000 сом');
    expect(lines.join('\n')).toContain('card: 70 000 сом');
  });

  it('builds trade-in contract lines with ru-KG date, IMEI and formatted price', () => {
    const lines = buildTradeInContractLines({
      id: 'trade-1',
      contractId: 'TI-20260708-ABC123',
      issuedAt: new Date('2026-07-08T10:30:00.000Z'),
      customer: { name: 'Айбек Продавец', phone: '+996700000000' },
      sellerPassport: 'AN1234567',
      model: 'iPhone 13 128GB',
      imei: '359-DUP-1',
      grade: 'B',
      price: 35000,
    }).join('\n');

    expect(lines).toContain('Дата: 08.07.2026');
    expect(lines).toContain('IMEI / SN: 359-DUP-1');
    expect(lines).toContain('Оценочная стоимость: 35 000 сом');
  });

  it('renders an order invoice PDF for a paid order', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}04`, name: 'Накладная Клиент' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-INV-${RUN}`,
        name: 'iPhone 15 Pro',
        price: 120000,
        cost: 90000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        total: 120000,
        status: 'paid',
        items: { create: [{ sku: product.sku, qty: 1, price: 120000, imei: `INV-IMEI-${RUN}` }] },
      },
    });
    await prisma.payment.createMany({
      data: [
        { orderId: order.id, amount: 50000, method: 'cash', status: 'received' },
        { orderId: order.id, amount: 70000, method: 'card', status: 'received' },
      ],
    });

    const out = await documents.orderInvoice(order.id);
    const pdf = Buffer.from(out.pdfBase64, 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.bytes).toBeGreaterThan(1000);
  });

  it('throws 422 for an unknown order invoice id', async () => {
    const err = await documents.orderInvoice('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('order_not_found');
  });

  it('renders a valid PDF for a trade-in record', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}01`, name: 'Айбек Продавец' },
    });
    const trade = await prisma.tradeInDevice.create({
      data: {
        customerId: customer.id,
        model: 'iPhone 13 128GB',
        grade: 'B',
        price: 35000,
        sellerPassport: 'AN1234567',
        imei: `TI-PDF-${RUN}`,
      },
    });

    const out = await documents.tradeInContract(trade.id);
    const pdf = Buffer.from(out.pdfBase64, 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-'); // real PDF
    expect(out.bytes).toBeGreaterThan(1000);
  });

  it('throws 422 for an unknown trade-in id', async () => {
    const err = await documents.tradeInContract('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('tradein_not_found');
  });

  it('renders a warranty talon PDF for a sold device (with buyer)', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}02`, name: 'Нурлан Покупатель' },
    });
    const product = await prisma.product.create({
      data: {
        sku: `SKU-W-${RUN}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        total: 100000,
        status: 'completed',
      },
    });
    const imei = `IMEI-W-${RUN}`;
    await prisma.deviceUnit.create({
      data: {
        imei,
        productId: product.id,
        location: 'BISHKEK-1',
        status: 'sold',
        orderId: order.id,
      },
    });

    const out = await documents.warrantyTalon(imei);
    const pdf = Buffer.from(out.pdfBase64, 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.bytes).toBeGreaterThan(1000);
  });

  it('throws 422 for an unknown IMEI', async () => {
    const err = await documents.warrantyTalon('nope-imei').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('unit_not_found');
  });

  it('renders a write-off act PDF for a write_off movement', async () => {
    const product = await prisma.product.create({
      data: {
        sku: `SKU-WO-${RUN}`,
        name: 'Xiaomi Redmi',
        price: 20000,
        cost: 15000,
        category: 'phones',
        attrs: {},
      },
    });
    const movement = await prisma.inventoryMovement.create({
      data: { productId: product.id, qty: -2, type: 'write_off', reason: 'брак' },
    });

    const out = await documents.writeOffAct(movement.id);
    const pdf = Buffer.from(out.pdfBase64, 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.bytes).toBeGreaterThan(1000);
  });

  it('rejects a non-write_off movement with 422', async () => {
    const product = await prisma.product.create({
      data: {
        sku: `SKU-WO2-${RUN}`,
        name: 'Кабель',
        price: 500,
        cost: 200,
        category: 'accessories',
        attrs: {},
      },
    });
    const movement = await prisma.inventoryMovement.create({
      data: { productId: product.id, qty: 10, type: 'received' },
    });

    const err = await documents.writeOffAct(movement.id).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('not_a_writeoff');
  });

  it('renders a write-off act resolved by the authorizing approval', async () => {
    const product = await prisma.product.create({
      data: {
        sku: `SKU-WOA-${RUN}`,
        name: 'Samsung Galaxy',
        price: 30000,
        cost: 22000,
        category: 'phones',
        attrs: {},
      },
    });
    const movement = await prisma.inventoryMovement.create({
      data: { productId: product.id, qty: -1, type: 'write_off', reason: 'порча' },
    });
    const approvalId = `approval-woa-${RUN}`;
    await prisma.auditEvent.create({
      data: {
        type: 'stock.written_off',
        actor: 'jest-owner',
        payload: { approvalId, productId: product.id, movementId: movement.id, qty: 1 },
        refs: [product.id, movement.id],
      },
    });

    const out = await documents.writeOffActByApproval(approvalId);
    const pdf = Buffer.from(out.pdfBase64, 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.bytes).toBeGreaterThan(1000);
  });

  it('throws 422 when no write-off event references the approval', async () => {
    const err = await documents.writeOffActByApproval(`missing-${RUN}`).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('writeoff_not_found');
  });

  it('renders a return act PDF for a Return record', async () => {
    const customer = await prisma.customer.create({
      data: { phone: `+996${RUN}03`, name: 'Возврат Клиент' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        total: 50000,
        status: 'return_requested',
      },
    });
    const ret = await prisma.return.create({
      data: { orderId: order.id, reason: 'не подошёл', status: 'requested' },
    });

    const out = await documents.returnAct(ret.id);
    const pdf = Buffer.from(out.pdfBase64, 'base64');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.bytes).toBeGreaterThan(1000);
  });

  it('throws 422 for an unknown return id', async () => {
    const err = await documents.returnAct('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('return_not_found');
  });
});
