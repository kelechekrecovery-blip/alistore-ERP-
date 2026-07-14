import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ProductsService } from '../src/products/products.service';
import { InventoryService } from '../src/inventory/inventory.service';

/**
 * Phase 7 — dangerous actions through the Approval Rules Matrix:
 *  - price change within ±15% applies directly; beyond → parked, applies on approve;
 *  - delete is gated → soft-delete (archived) on approve;
 *  - write-off/adjust are gated → InventoryMovement on approve.
 */
describe('Dangerous actions via approval (integration)', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let products: ProductsService;
  let inventory: InventoryService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    products = new ProductsService(prisma, audit, approvals);
    inventory = new InventoryService(prisma, audit, approvals);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
  });

  async function product(price = 100000, trackingMode: 'serialized' | 'quantity' = 'serialized') {
    seq += 1;
    return prisma.product.create({
      data: { sku: `DA-${seq}`, name: 'iPhone', price, cost: 80000, category: 'phones', trackingMode, attrs: {} },
    });
  }

  it('applies a price change within ±15% directly', async () => {
    const p = await product(100000);
    const res = await products.changePrice(p.id, 110000, '+10%', 'seller');
    expect((res as { applied?: boolean }).applied).toBe(true);
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.price).toBe(110000);
  });

  it('parks a price change beyond ±15% and applies it only on approve', async () => {
    const p = await product(100000);
    const res = (await products.changePrice(p.id, 130000, '+30%', 'seller')) as {
      approvalId: string;
    };
    expect(res.approvalId).toBeDefined();
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.price).toBe(100000);

    await approvals.decide(res.approvalId, { status: 'approved', approver: 'admin', approverRole: 'admin' });
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.price).toBe(130000);
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['approval.requested', 'approval.approved', 'price.changed']));
  });

  it('gates delete → soft-delete (archived) on approve', async () => {
    const p = await product();
    const res = (await products.archive(p.id, 'снят', 'owner')) as { approvalId: string };
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.archived).toBe(false);

    await approvals.decide(res.approvalId, { status: 'approved', approver: 'owner', approverRole: 'owner' });
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.archived).toBe(true);
  });

  it('gates a write-off → InventoryMovement + stock.written_off on approve', async () => {
    const p = await product(100000, 'quantity');
    await prisma.inventoryBalance.create({ data: { productId: p.id, location: 'BISHKEK-1', onHand: 5 } });
    const res = (await inventory.movement(
      { productId: p.id, qty: 2, type: 'write_off', location: 'BISHKEK-1', reason: 'бой' },
      'warehouse',
    )) as { approvalId: string };

    expect(await prisma.inventoryMovement.count()).toBe(0);
    await approvals.decide(res.approvalId, { status: 'approved', approver: 'owner', approverRole: 'owner' });

    const mv = await prisma.inventoryMovement.findFirst({ where: { productId: p.id } });
    expect(mv?.type).toBe('write_off');
    expect(mv?.qty).toBe(-2);
    expect(await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: p.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 3, reserved: 0 });
    const types = (await prisma.auditEvent.findMany()).map((e) => e.type);
    expect(types).toContain('stock.written_off');
  });

  it('does not apply a rejected write-off', async () => {
    const p = await product(100000, 'quantity');
    const res = (await inventory.movement(
      { productId: p.id, qty: 1, type: 'adjust', location: 'BISHKEK-1', reason: 'пересчёт' },
      'warehouse',
    )) as { approvalId: string };
    await approvals.decide(res.approvalId, { status: 'rejected', approver: 'owner', approverRole: 'owner' });
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it('applies signed adjustments and never consumes reserved quantity', async () => {
    const p = await product(100000, 'quantity');
    await prisma.inventoryBalance.create({
      data: { productId: p.id, location: 'BISHKEK-1', onHand: 5, reserved: 3 },
    });
    const increase = (await inventory.movement({
      productId: p.id,
      location: 'BISHKEK-1',
      qty: 2,
      type: 'adjust',
      direction: 'increase',
      reason: 'найдено при пересчёте',
    }, 'warehouse')) as { approvalId: string };
    await approvals.decide(increase.approvalId, { status: 'approved', approver: 'owner', approverRole: 'owner' });
    expect(await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: p.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 7, reserved: 3 });

    const blocked = (await inventory.movement({
      productId: p.id,
      location: 'BISHKEK-1',
      qty: 5,
      type: 'write_off',
      reason: 'недостача',
    }, 'warehouse')) as { approvalId: string };
    await expect(approvals.decide(blocked.approvalId, {
      status: 'approved', approver: 'owner', approverRole: 'owner',
    })).rejects.toMatchObject({ code: 'insufficient_available_stock' });
    expect(await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: p.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 7, reserved: 3 });
    expect(await prisma.inventoryMovement.count({ where: { type: 'write_off' } })).toBe(0);
  });
});
