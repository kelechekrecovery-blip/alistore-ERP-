import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ForbiddenError, ValidationError } from '../src/common/errors';

describe('Inventory StorePoint identity (integration)', () => {
  const run = `inventory-point-${Math.floor(Math.random() * 1_000_000)}`;
  const locationA = `${run}-A`;
  const locationB = `${run}-B`;
  const locationInactive = `${run}-OFF`;
  let prisma: PrismaService;
  let inventory: InventoryService;
  let productId: string;
  let warehouseId: string;
  let ownerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    inventory = new InventoryService(prisma, audit, new ApprovalsService(prisma, audit));
    const createPoint = (suffix: string, inventoryLocation: string, active = true) => prisma.storePoint.create({
      data: {
        code: `${run}-${suffix}`.toLowerCase(),
        name: `Point ${suffix}`,
        address: '—',
        inventoryLocation,
        hours: '—',
        active,
        createdBy: run,
        idempotencyKey: `${run}:${suffix}`,
      },
    });
    await Promise.all([
      createPoint('a', locationA),
      createPoint('b', locationB),
      createPoint('off', locationInactive, false),
    ]);
    const [warehouse, owner, product] = await Promise.all([
      prisma.staffUser.create({ data: { username: `${run}-warehouse`, passwordHash: 'fixture', role: 'warehouse', point: locationA } }),
      prisma.staffUser.create({ data: { username: `${run}-owner`, passwordHash: 'fixture', role: 'owner', point: locationA } }),
      prisma.product.create({
        data: { sku: `${run}-sku`, name: 'StorePoint fixture', price: 100, cost: 50, category: 'test', trackingMode: 'quantity', attrs: {} },
      }),
    ]);
    warehouseId = warehouse.id;
    ownerId = owner.id;
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { refs: { has: productId } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId } });
    await prisma.inventoryMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: run } } });
    await prisma.storePoint.deleteMany({ where: { code: { startsWith: run.toLowerCase() } } });
    await prisma.$disconnect();
  });

  it('pins a non-owner receive mutation to the assigned StorePoint', async () => {
    await expect(inventory.receiveQuantity({
      idempotencyKey: `${run}:spoof`,
      productId,
      location: locationB,
      quantity: 1,
    }, warehouseId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets an owner explicitly select another active StorePoint', async () => {
    const result = await inventory.receiveQuantity({
      idempotencyKey: `${run}:owner`,
      productId,
      location: locationB,
      quantity: 1,
    }, ownerId);
    expect(result.location).toBe(locationB);
  });

  it('rejects an inactive transfer destination', async () => {
    await expect(inventory.transferQuantity({
      idempotencyKey: `${run}:inactive`,
      productId,
      from: locationA,
      to: locationInactive,
      qty: 1,
    }, ownerId)).rejects.toBeInstanceOf(ValidationError);
  });
});
