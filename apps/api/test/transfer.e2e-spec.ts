import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ConflictError, ValidationError } from '../src/common/errors';

/**
 * Phase 9 — inter-branch transfer: move an in_stock unit to another location,
 * writing an InventoryMovement(moved) + stock.moved. Sold/reserved units can't move.
 */
describe('Stock transfer (integration)', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    inventory = new InventoryService(prisma, audit, new ApprovalsService(prisma, audit));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
  });

  async function unit(status: 'in_stock' | 'sold', location = 'BISHKEK-1') {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `TR-${seq}`, name: 'x', price: 1, cost: 1, category: 'c', attrs: {} },
    });
    const imei = `TR-${seq}-1`;
    await prisma.deviceUnit.create({ data: { imei, productId: product.id, status, location } });
    return imei;
  }

  it('moves an in_stock unit and writes stock.moved', async () => {
    const imei = await unit('in_stock', 'BISHKEK-1');
    const res = await inventory.transfer({ imei, to: 'BISHKEK-2' }, 'warehouse');
    expect(res.from).toBe('BISHKEK-1');
    expect(res.to).toBe('BISHKEK-2');

    expect((await prisma.deviceUnit.findUnique({ where: { imei } }))?.location).toBe('BISHKEK-2');
    const mv = await prisma.inventoryMovement.findFirst({ where: { type: 'moved' } });
    expect(mv?.from).toBe('BISHKEK-1');
    expect(mv?.to).toBe('BISHKEK-2');
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('stock.moved');
  });

  it('refuses to move a sold unit (409)', async () => {
    const imei = await unit('sold');
    const err = await inventory.transfer({ imei, to: 'BISHKEK-2' }, 'warehouse').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('not_transferable');
  });

  it('refuses a move to the same location (422)', async () => {
    const imei = await unit('in_stock', 'BISHKEK-1');
    const err = await inventory.transfer({ imei, to: 'BISHKEK-1' }, 'warehouse').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('same_location');
  });
});
