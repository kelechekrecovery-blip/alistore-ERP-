import { PrismaService } from '../src/prisma/prisma.service';
import { LabelsService } from '../src/labels/labels.service';
import { ValidationError } from '../src/common/errors';

/**
 * LabelsService.unitLabel against a real DeviceUnit in Postgres — proves the
 * bwip-js integration is wired to warehouse stock without touching intake code.
 * No global wipe (grown FK-linked schema): seeds unique rows, reads by IMEI.
 */
describe('LabelsService.unitLabel (integration)', () => {
  let prisma: PrismaService;
  let labels: LabelsService;
  let seq = 0;
  const RUN = Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    labels = new LabelsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('generates an IMEI label for a stored unit (with product name + status)', async () => {
    seq += 1;
    const imei = `IMEI-L-${RUN}-${seq}`;
    const product = await prisma.product.create({
      data: {
        sku: `SKU-L-${RUN}-${seq}`,
        name: 'iPhone 15',
        price: 100000,
        cost: 80000,
        category: 'phones',
        attrs: {},
      },
    });
    await prisma.deviceUnit.create({
      data: { imei, productId: product.id, location: 'BISHKEK-1', status: 'in_stock' },
    });

    const out = await labels.unitLabel(imei);
    expect(out.imei).toBe(imei);
    expect(out.product).toBe('iPhone 15');
    expect(out.status).toBe('in_stock');
    expect(out.svg.startsWith('<svg')).toBe(true);
  });

  it('throws 422 for an unknown IMEI', async () => {
    const err = await labels.unitLabel('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe('unit_not_found');
  });
});
