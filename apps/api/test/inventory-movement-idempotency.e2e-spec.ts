import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';

/**
 * INV-WRITEOFF-IDEMPOTENCY-001.
 *
 * A stock write-off is approval-gated, so a duplicate request does not deduct
 * stock by itself — it parks a SECOND approval for the same physical event. If
 * the responsible person approves both (they look identical, because they are),
 * the stock is deducted twice for one real write-off and the second deduction is
 * indistinguishable from a genuine one.
 *
 * `Approval.idempotencyKey` is already declared unique in the schema; it was
 * simply never populated. With a key supplied, a repeat must replay the first
 * approval rather than create another one.
 */
describe('Inventory movement idempotency (integration)', () => {
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
    await prisma.approval.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.product.deleteMany();
  });

  async function quantityProduct() {
    seq += 1;
    return prisma.product.create({
      data: {
        sku: `IMI-${seq}`,
        name: 'x',
        price: 100,
        cost: 60,
        category: 'c',
        attrs: {},
        trackingMode: 'quantity',
      },
    });
  }

  const writeOff = (productId: string, idempotencyKey?: string) => inventory.movement(
    { productId, qty: 2, type: 'write_off', location: 'BISHKEK-1', reason: 'бой при транспортировке' },
    'warehouse_lead',
    idempotencyKey,
  );

  it('replays the same approval when the request carries the same key', async () => {
    const product = await quantityProduct();

    const first = await writeOff(product.id, 'writeoff-key-1');
    const second = await writeOff(product.id, 'writeoff-key-1');

    expect(second.approvalId).toBe(first.approvalId);
    expect(await prisma.approval.count({ where: { action: 'write_off' } })).toBe(1);
  });

  it('does not emit a second approval-requested event on replay', async () => {
    const product = await quantityProduct();
    await writeOff(product.id, 'writeoff-key-2');
    await writeOff(product.id, 'writeoff-key-2');

    const events = await prisma.auditEvent.findMany({ where: { type: 'approval.requested' } });
    expect(events).toHaveLength(1);
  });

  it('keeps distinct keys as distinct approvals — a real second write-off still parks', async () => {
    const product = await quantityProduct();
    const first = await writeOff(product.id, 'writeoff-key-3a');
    const second = await writeOff(product.id, 'writeoff-key-3b');

    expect(second.approvalId).not.toBe(first.approvalId);
    expect(await prisma.approval.count({ where: { action: 'write_off' } })).toBe(2);
  });

  it('survives a concurrent duplicate — the unique key decides, not the read', async () => {
    // Two identical taps racing: both may find no existing approval before either
    // inserts, so the unique constraint has to be the arbiter.
    const product = await quantityProduct();
    const [a, b] = await Promise.all([
      writeOff(product.id, 'writeoff-key-4'),
      writeOff(product.id, 'writeoff-key-4'),
    ]);

    expect(a.approvalId).toBe(b.approvalId);
    expect(await prisma.approval.count({ where: { action: 'write_off' } })).toBe(1);
  });

  it('refuses a key already used by a different action instead of replaying it', async () => {
    // Approval.idempotencyKey is unique across ALL actions, so a key colliding
    // with another action must not hand back that action's approval — on a money
    // path, returning a refund's id for a write-off is worse than any error.
    const product = await quantityProduct();
    await prisma.approval.create({
      data: {
        action: 'refund',
        requester: 'cashier',
        reason: 'возврат',
        status: 'requested',
        idempotencyKey: 'shared-key',
        evidence: {},
      },
    });

    await expect(writeOff(product.id, 'shared-key')).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    expect(await prisma.approval.count({ where: { action: 'write_off' } })).toBe(0);
  });

  it('stays backwards compatible: no key still parks an approval', async () => {
    // The shipped iOS build does not send the header yet, and build 4 is in
    // App Review — the endpoint must keep working without a key.
    const product = await quantityProduct();
    const parked = await writeOff(product.id);
    expect(parked.approvalId).toBeTruthy();
    expect(parked.status).toBe('requested');
  });
});
