import { PrismaService } from '../src/prisma/prisma.service';
import { UnitsService } from '../src/units/units.service';
import { ValidationError } from '../src/common/errors';

/** Unit lookup by IMEI (powers the cashier exchange flow). */
describe('UnitsService.getByImei (integration)', () => {
  let prisma: PrismaService;
  let units: UnitsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    units = new UnitsService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
  });

  it('returns the unit with its product for a known IMEI', async () => {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `LK-${seq}`, name: 'iPhone', price: 90000, cost: 70000, category: 'phones', attrs: {} },
    });
    const imei = `LK-${seq}-1`;
    await prisma.deviceUnit.create({ data: { imei, productId: product.id, status: 'sold', location: 'B', orderId: 'ord-1' } });

    const found = await units.getByImei(imei);
    expect(found).toMatchObject({ imei, status: 'sold', product: 'iPhone', price: 90000, orderId: 'ord-1' });
  });

  it('throws for an unknown IMEI', async () => {
    const err = await units.getByImei('nope').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('unit_not_found');
  });
});
