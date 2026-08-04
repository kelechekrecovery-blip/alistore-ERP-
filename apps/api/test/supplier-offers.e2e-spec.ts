import { ApprovalsService } from '../src/approvals/approvals.service';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsService } from '../src/products/products.service';
import { SupplierOffersService } from '../src/procurement/supplier-offers.service';

describe('SupplierOffer commerce foundation', () => {
  let prisma: PrismaService;
  let products: ProductsService;
  let offers: SupplierOffersService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    products = new ProductsService(prisma, audit, new ApprovalsService(prisma, audit));
    offers = new SupplierOffersService(prisma, audit);
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.supplierOffer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.supplier.deleteMany();
  });

  afterAll(async () => {
    await prisma.supplierOffer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.$disconnect();
  });

  async function supplier() {
    seq += 1;
    return prisma.supplier.create({ data: { name: `Offer Supplier ${seq}` } });
  }

  it('rejects creating a to-order product without an active supplier offer', async () => {
    seq += 1;
    await expect(products.create({
      sku: `OFFER-MISSING-${seq}`,
      name: 'Нет предложения',
      price: 100_000,
      cost: 80_000,
      category: 'phones',
      supplyMode: 'to_order',
      supplyLeadDays: 5,
    }, 'owner')).rejects.toMatchObject({ code: 'product_supply_offer_required' });
  });

  it('creates a to-order product and its 24-hour supplier quote atomically', async () => {
    const sup = await supplier();
    seq += 1;
    const created = await products.create({
      sku: `OFFER-CREATE-${seq}`,
      name: 'С предложением',
      price: 100_000,
      cost: 80_000,
      category: 'phones',
      supplyMode: 'to_order',
      supplyLeadDays: 5,
      supplierOffer: {
        supplierId: sup.id,
        unitCost: 80_000,
        availableQty: 3,
        leadDays: 5,
      },
    }, 'owner');

    expect(created).toMatchObject({
      supplyMode: 'to_order',
      supplyLeadDays: 5,
      supplierId: sup.id,
    });
    const offer = await prisma.supplierOffer.findFirstOrThrow({
      where: { productId: created.id, active: true },
    });
    expect(offer).toMatchObject({
      supplierId: sup.id,
      unitCost: 80_000,
      availableQty: 3,
      leadDays: 5,
    });
    expect(offer.validUntil.getTime() - offer.checkedAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('serializes concurrent replacements and leaves exactly one active offer', async () => {
    const firstSupplier = await supplier();
    const secondSupplier = await supplier();
    seq += 1;
    const product = await prisma.product.create({
      data: {
        sku: `OFFER-RACE-${seq}`,
        name: 'Race',
        price: 100_000,
        cost: 70_000,
        category: 'phones',
        supplyMode: 'to_order',
        supplyLeadDays: 5,
        attrs: {},
      },
    });

    await Promise.all([
      offers.replace(product.id, {
        supplierId: firstSupplier.id,
        unitCost: 75_000,
        availableQty: 2,
        leadDays: 5,
      }, 'owner-a'),
      offers.replace(product.id, {
        supplierId: secondSupplier.id,
        unitCost: 76_000,
        availableQty: 4,
        leadDays: 7,
      }, 'owner-b'),
    ]);

    expect(await prisma.supplierOffer.count({
      where: { productId: product.id, active: true },
    })).toBe(1);
    expect(await prisma.supplierOffer.count({ where: { productId: product.id } })).toBe(2);
  });

  it('reports a quote below the 10% margin floor as approval-required', async () => {
    const sup = await supplier();
    seq += 1;
    const product = await prisma.product.create({
      data: {
        sku: `OFFER-MARGIN-${seq}`,
        name: 'Low margin',
        price: 100_000,
        cost: 95_000,
        category: 'phones',
        supplyMode: 'to_order',
        supplyLeadDays: 5,
        attrs: {},
      },
    });

    const result = await offers.replace(product.id, {
      supplierId: sup.id,
      unitCost: 95_000,
      availableQty: 1,
      leadDays: 5,
    }, 'owner');

    expect(result).toMatchObject({
      marginBps: 500,
      minimumMarginBps: 1000,
      requiresApproval: true,
    });
  });

  it('integrity report finds stock and an expired quote on a to-order product', async () => {
    const sup = await supplier();
    seq += 1;
    const product = await prisma.product.create({
      data: {
        sku: `OFFER-INTEGRITY-${seq}`,
        name: 'Broken invariant',
        price: 100_000,
        cost: 70_000,
        category: 'phones',
        trackingMode: 'quantity',
        supplyMode: 'to_order',
        supplyLeadDays: 5,
        attrs: {},
      },
    });
    const now = Date.now();
    await prisma.supplierOffer.create({
      data: {
        productId: product.id,
        supplierId: sup.id,
        unitCost: 70_000,
        availableQty: 1,
        leadDays: 5,
        checkedAt: new Date(now - 48 * 60 * 60 * 1000),
        validUntil: new Date(now - 24 * 60 * 60 * 1000),
        updatedBy: 'test',
      },
    });
    await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'MANAS-1', onHand: 1, reserved: 0 },
    });

    const report = await offers.integrity('owner');
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'to_order_has_stock', productId: product.id }),
      expect.objectContaining({ code: 'supplier_offer_expired', productId: product.id }),
    ]));
  });
});
