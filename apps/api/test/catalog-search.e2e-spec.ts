import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { ForbiddenError } from '../src/common/errors';

describe('Catalog search integration', () => {
  let prisma: PrismaService;
  let catalog: CatalogService;
  let seq = 0;

  beforeAll(async () => {
    delete process.env.MEILI_HOST;
    delete process.env.SEARCH_ADMIN_TOKEN;
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new CatalogService(prisma, new ConfigService());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function seedCatalog() {
    seq += 1;
    const suffix = seq.toString().padStart(3, '0');
    const phone = await prisma.product.create({
      data: {
        sku: `IPHONE-15-${suffix}`,
        name: 'iPhone 15 Pro Max',
        price: 145000,
        cost: 120000,
        category: 'phones',
        attrs: { storage: '256GB', color: 'natural' },
      },
    });
    const watch = await prisma.product.create({
      data: {
        sku: `WATCH-S9-${suffix}`,
        name: 'Apple Watch Series 9',
        price: 42900,
        cost: 33000,
        category: 'wearables',
        attrs: { size: '45mm' },
      },
    });
    await prisma.deviceUnit.create({
      data: {
        imei: `CAT-IMEI-${suffix}`,
        productId: phone.id,
        status: 'in_stock',
        location: 'BISHKEK-1',
      },
    });
    await prisma.deviceUnit.create({
      data: {
        imei: `CAT-SOLD-${suffix}`,
        productId: watch.id,
        status: 'sold',
        location: 'BISHKEK-1',
      },
    });
    return { phone, watch };
  }

  it('uses Postgres as catalog source of truth when Meilisearch is not configured', async () => {
    const { phone } = await seedCatalog();

    const result = await catalog.search({
      q: 'iphone',
      stockOnly: true,
      limit: 10,
      offset: 0,
    });

    expect(result.source).toBe('postgres');
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: phone.id,
      sku: phone.sku,
      availableUnits: 1,
    });
    expect(result.items[0]).not.toHaveProperty('cost');
  });

  it('supports category filters and excludes out-of-stock products when requested', async () => {
    await seedCatalog();

    const inStockOnly = await catalog.search({
      category: 'wearables',
      stockOnly: true,
      limit: 10,
      offset: 0,
    });
    const allWearables = await catalog.search({
      category: 'wearables',
      limit: 10,
      offset: 0,
    });

    expect(inStockOnly.total).toBe(0);
    expect(allWearables.total).toBe(1);
    expect(allWearables.items[0].availableUnits).toBe(0);
  });

  it('returns delta changes for product updates, stock updates, and archived removals', async () => {
    const { phone, watch } = await seedCatalog();
    const since = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));

    await prisma.product.update({
      where: { id: watch.id },
      data: { archived: true },
    });
    await prisma.deviceUnit.updateMany({
      where: { productId: phone.id, status: 'in_stock' },
      data: { status: 'sold' },
    });

    const delta = await catalog.delta({ since, limit: 10 });

    expect(delta.cursor).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(delta.truncated).toBe(false);
    expect(delta.removed).toEqual([watch.id]);
    expect(delta.changed.map((item) => item.id)).toEqual([phone.id]);
    expect(delta.changed[0]).toMatchObject({
      sku: phone.sku,
      availableUnits: 0,
    });
    expect(delta.changed[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps reindex disabled until a maintenance token is configured', async () => {
    await seedCatalog();

    const err = await catalog.reindex('anything').catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.getStatus()).toBe(403);
    expect(err.code).toBe('maintenance_token_not_configured');
  });
});
