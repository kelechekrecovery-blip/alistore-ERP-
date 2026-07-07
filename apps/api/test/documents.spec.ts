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
});
