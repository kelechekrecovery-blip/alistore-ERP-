import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ValidationError } from '../src/common/errors';

/**
 * Phase 9 — inventory count: counted vs the in_stock units on record, recorded as
 * inventory.counted with the diff (the correction is a separate gated adjustment).
 */
describe('Inventory count (integration)', () => {
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

  async function product(inStock: number, location = 'BISHKEK-1') {
    seq += 1;
    const p = await prisma.product.create({
      data: { sku: `IC-${seq}`, name: 'x', price: 1, cost: 1, category: 'c', attrs: {} },
    });
    for (let n = 0; n < inStock; n += 1) {
      await prisma.deviceUnit.create({ data: { imei: `IC-${seq}-${n}`, productId: p.id, status: 'in_stock', location } });
    }
    return p;
  }

  it('records counted vs expected with the diff', async () => {
    const p = await product(3, 'BISHKEK-1');
    const res = await inventory.count({ productId: p.id, location: 'BISHKEK-1', counted: 2 }, 'warehouse');
    expect(res.expected).toBe(3);
    expect(res.counted).toBe(2);
    expect(res.diff).toBe(-1);

    const mv = await prisma.inventoryMovement.findFirst({ where: { type: 'count' } });
    expect(mv?.qty).toBe(-1);
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('inventory.counted');
  });

  it('rejects a count for an unknown product (422)', async () => {
    const err = await inventory.count({ productId: 'nope', location: 'X', counted: 1 }, 'w').catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('product_not_found');
  });
});
