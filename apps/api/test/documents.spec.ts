import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentsService } from '../src/documents/documents.service';
import { ValidationError } from '../src/common/errors';

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
});
