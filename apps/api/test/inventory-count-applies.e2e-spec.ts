import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError } from '../src/common/errors';
import { InventoryService } from '../src/inventory/inventory.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';

describe('Inventory count approval invariant', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let inventory: InventoryService;
  const run = Math.floor(Math.random() * 1_000_000);
  let seq = 0;
  const requester = `count-requester-${run}`;
  const approver = `count-approver-${run}`;
  const verifyStepUpOnTx = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const staffAuth = { verifyStepUpOnTx } as unknown as StaffAuthService;
    approvals = new ApprovalsService(prisma, audit, undefined, staffAuth);
    inventory = new InventoryService(prisma, audit, approvals);
  });

  afterAll(async () => {
    const [products, ownedApprovals] = await Promise.all([
      prisma.product.findMany({
        where: { sku: { startsWith: `CNT-${run}-` } },
        select: { id: true },
      }),
      prisma.approval.findMany({ where: { requester }, select: { id: true } }),
    ]);
    const productIds = products.map(({ id }) => id);
    const approvalIds = ownedApprovals.map(({ id }) => id);
    if (productIds.length > 0) {
      const movements = await prisma.inventoryMovement.findMany({
        where: { productId: { in: productIds } },
        select: { id: true },
      });
      const movementIds = movements.map(({ id }) => id);
      await prisma.auditEvent.deleteMany({
        where: { refs: { hasSome: [...productIds, ...movementIds, ...approvalIds] } },
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED');
        await tx.accountingJournalLine.deleteMany({
          where: { entry: { sourceType: 'inventory.adjustment', sourceRef: { in: movementIds } } },
        });
        await tx.accountingJournalEntry.deleteMany({
          where: { sourceType: 'inventory.adjustment', sourceRef: { in: movementIds } },
        });
      });
      await prisma.inventoryValuationIssue.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await prisma.approval.deleteMany({ where: { id: { in: approvalIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    verifyStepUpOnTx.mockReset();
    verifyStepUpOnTx.mockImplementation(async (_tx, _staffId, token?: string) => {
      if (token !== '123456') {
        throw new ConflictError('totp_required', 'Требуется одноразовый код');
      }
    });
  });

  async function quantityProduct(onHand: number, unitCost = 800) {
    seq += 1;
    const product = await prisma.product.create({
      data: {
        sku: `CNT-${run}-${seq}`,
        name: 'Кабель',
        price: 1200,
        cost: unitCost,
        category: 'accessories',
        trackingMode: 'quantity',
        attrs: {},
      },
    });
    if (onHand > 0) {
      const balance = await prisma.inventoryBalance.create({
        data: { productId: product.id, location: 'BISHKEK-1', onHand },
      });
      await prisma.inventoryValuationLayer.create({
        data: {
          productId: product.id,
          balanceId: balance.id,
          location: 'BISHKEK-1',
          sourceType: 'inventory.receipt',
          sourceRef: `count-fixture-${product.id}`,
          quantityReceived: onHand,
          quantityRemaining: onHand,
          unitCost,
        },
      });
      await prisma.inventoryBalance.update({
        where: { id: balance.id },
        data: { inventoryValue: onHand * unitCost },
      });
    }
    return product;
  }

  it('records a non-zero discrepancy without changing balance, valuation, or GL', async () => {
    const product = await quantityProduct(5);
    expect(await prisma.inventoryValuationLayer.aggregate({
      where: { productId: product.id },
      _sum: { quantityRemaining: true },
    })).toMatchObject({ _sum: { quantityRemaining: 5 } });

    const result = await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 2 },
      requester,
      `count-observation-${run}-${seq}`,
    );

    expect(result).toMatchObject({ expected: 5, counted: 2, diff: -3 });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 5, inventoryValue: 4000 });
    expect(await prisma.inventoryValuationLayer.aggregate({
      where: { productId: product.id },
      _sum: { quantityRemaining: true },
    })).toMatchObject({ _sum: { quantityRemaining: 5 } });
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.adjustment', sourceRef: result.movementId },
    })).toBe(0);
    expect(await prisma.inventoryMovement.findUnique({ where: { id: result.movementId } }))
      .toMatchObject({ type: 'count', qty: -3 });
    expect(await prisma.auditEvent.findFirst({
      where: { type: 'inventory.counted', refs: { has: result.movementId } },
    })).toBeTruthy();
  });

  it('replays the exact count but rejects the same key for another command or actor', async () => {
    const product = await quantityProduct(5);
    const otherProduct = await quantityProduct(5);
    const key = `bound-count-${run}-${seq}`;
    const command = { productId: product.id, location: 'BISHKEK-1', counted: 2 };
    const first = await inventory.count(command, requester, key);

    await expect(inventory.count(command, requester, key)).resolves.toEqual(first);
    await expect(inventory.count(
      { ...command, counted: 3 },
      requester,
      key,
    )).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(inventory.count(
      { ...command, productId: otherProduct.id },
      requester,
      key,
    )).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(inventory.count(
      { ...command, location: 'BISHKEK-2' },
      requester,
      key,
    )).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(inventory.count(
      command,
      `${requester}-other`,
      key,
    )).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    expect(await prisma.inventoryMovement.count({
      where: { idempotencyKey: key, type: 'count' },
    })).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { type: 'inventory.counted', refs: { has: first.movementId } },
    })).toBe(1);
  });

  it('applies the discrepancy only through one replay-safe, stepped-up four-eyes stock adjustment', async () => {
    const product = await quantityProduct(5);
    const observationKey = `count-adjust-observation-${run}-${seq}`;
    const count = await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 2 },
      requester,
      observationKey,
    );
    await expect(inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 2 },
      requester,
      observationKey,
    )).resolves.toEqual(count);
    const key = `count-adjust-${run}-${seq}`;
    const command = {
      productId: product.id,
      location: 'BISHKEK-1',
      qty: 3,
      type: 'adjust' as const,
      direction: 'decrease' as const,
      reason: 'недостача по пересчёту',
      countMovementId: count.movementId,
    };

    const requested = await inventory.movement(command, requester, key);
    await expect(inventory.movement(command, requester, key)).resolves.toEqual(requested);
    await expect(approvals.decideWithStepUp(requested.approvalId, {
      status: 'approved',
      approver: requester,
      approverRole: 'owner',
    }, '123456')).rejects.toMatchObject({ code: 'four_eye_approval_required' });
    await expect(approvals.decideWithStepUp(requested.approvalId, {
      status: 'approved',
      approver,
      approverRole: 'owner',
    })).rejects.toMatchObject({ code: 'totp_required' });

    await approvals.decideWithStepUp(requested.approvalId, {
      status: 'approved',
      approver,
      approverRole: 'owner',
    }, '123456');

    expect(await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 2, inventoryValue: 1600 });
    const adjustment = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id, type: 'adjust' },
    });
    expect(await prisma.auditEvent.findFirst({
      where: { type: 'stock.adjusted', refs: { hasEvery: [requested.approvalId, count.movementId, adjustment.id] } },
    })).toBeTruthy();
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, type: 'count' },
    })).toBe(1);

  });

  it('rejects a count-linked command when stock changed after the count but before request', async () => {
    const product = await quantityProduct(5);
    const count = await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 2 },
      requester,
      `count-before-request-race-${run}-${seq}`,
    );
    await prisma.inventoryBalance.update({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
      data: { onHand: 4 },
    });

    await expect(inventory.movement({
      productId: product.id,
      location: 'BISHKEK-1',
      qty: 3,
      type: 'adjust',
      direction: 'decrease',
      reason: 'stale count command',
      countMovementId: count.movementId,
    }, requester, `stale-count-adjust-${run}-${seq}`))
      .rejects.toMatchObject({ code: 'inventory_count_balance_changed' });
    expect(await prisma.approval.count({
      where: {
        action: 'stock_adjust',
        evidence: { path: ['payload', 'countMovementId'], equals: count.movementId },
      },
    })).toBe(0);
  });

  it('fails closed when stock changes after the adjustment snapshot', async () => {
    const product = await quantityProduct(5);
    const requested = await inventory.movement({
      productId: product.id,
      location: 'BISHKEK-1',
      qty: 3,
      type: 'adjust',
      direction: 'decrease',
      reason: 'race after count observation',
    }, requester, `count-race-${run}-${seq}`);
    await prisma.inventoryBalance.update({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
      data: { onHand: 4 },
    });

    await expect(approvals.decideWithStepUp(requested.approvalId, {
      status: 'approved',
      approver,
      approverRole: 'owner',
    }, '123456')).rejects.toMatchObject({ code: 'stock_adjust_snapshot_changed' });
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, type: 'adjust' },
    })).toBe(0);
  });

  it('allows at most one adjustment for one count observation across two approval keys', async () => {
    const product = await quantityProduct(5);
    const observationKey = `count-claim-observation-${run}-${seq}`;
    const count = await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 2 },
      requester,
      observationKey,
    );
    const command = {
      productId: product.id,
      location: 'BISHKEK-1',
      qty: 3,
      type: 'adjust' as const,
      direction: 'decrease' as const,
      reason: 'один пересчёт, две ошибочные заявки',
      countMovementId: count.movementId,
    };
    const [first, second] = await Promise.all([
      inventory.movement(command, requester, `count-claim-a-${run}-${seq}`),
      inventory.movement(command, requester, `count-claim-b-${run}-${seq}`),
    ]);

    const decisions = await Promise.allSettled([
      approvals.decideWithStepUp(first.approvalId, {
        status: 'approved', approver, approverRole: 'owner',
      }, '123456'),
      approvals.decideWithStepUp(second.approvalId, {
        status: 'approved', approver, approverRole: 'owner',
      }, '123456'),
    ]);

    expect(decisions.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(decisions.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { code: 'inventory_count_already_applied' },
    });
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, type: 'adjust' },
    })).toBe(1);
    expect(await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: count.movementId },
    })).toMatchObject({ idempotencyKey: observationKey });
    expect(await prisma.approval.count({
      where: { sourceRef: `inventory-count:${count.movementId}` },
    })).toBe(1);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 2, inventoryValue: 1600 });
  });

  it('rejects a legacy stock-adjust approval with an auditable legacy snapshot outcome', async () => {
    const product = await quantityProduct(5);
    const legacy = await approvals.request({
      action: 'stock_adjust',
      requester,
      reason: 'legacy pending adjustment',
      idempotencyKey: `legacy-count-adjust-${run}-${seq}`,
      payload: {
        productId: product.id,
        location: 'BISHKEK-1',
        qty: 1,
        direction: 'decrease',
        reason: 'legacy pending adjustment',
      },
    });

    const result = await approvals.decideWithStepUp(legacy.approvalId, {
      status: 'approved',
      approver,
      approverRole: 'owner',
    }, '123456');

    expect(result).toMatchObject({ status: 'rejected', approver });
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, type: 'adjust' },
    })).toBe(0);
    expect(await prisma.auditEvent.findFirst({
      where: { type: 'approval.rejected', refs: { has: legacy.approvalId } },
    })).toMatchObject({
      payload: expect.objectContaining({ outcome: 'legacy_snapshot_required' }),
    });
  });

  it('binds approval idempotency to requester and canonical payload/evidence', async () => {
    const key = `bound-approval-${run}-${seq}`;
    const request = {
      action: 'stock_adjust',
      requester,
      reason: 'bound command',
      idempotencyKey: key,
      payload: {
        productId: `bound-product-${run}`,
        location: 'BISHKEK-1',
        qty: 1,
        direction: 'decrease',
        expectedOnHand: 5,
      },
      evidence: { inventoryCountMovementId: `bound-count-${run}` },
    };
    const first = await approvals.request(request);

    await expect(approvals.request({
      ...request,
      payload: { ...request.payload },
      evidence: { ...request.evidence },
    })).resolves.toEqual(first);
    await expect(approvals.request({
      ...request,
      requester: `${requester}-other`,
    })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(approvals.request({
      ...request,
      payload: { ...request.payload, qty: 2 },
    })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(approvals.request({
      ...request,
      payload: { ...request.payload, location: 'BISHKEK-2' },
    })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(approvals.request({
      ...request,
      evidence: { inventoryCountMovementId: `other-count-${run}` },
    })).rejects.toMatchObject({ code: 'idempotency_key_reused' });
  });

  it('keeps a zero discrepancy harmless and idempotent', async () => {
    const product = await quantityProduct(5);

    const countKey = `zero-count-${run}-${seq}`;
    const first = await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 5 },
      requester,
      countKey,
    );
    const second = await inventory.count(
      { productId: product.id, location: 'BISHKEK-1', counted: 5 },
      requester,
      countKey,
    );

    expect(first.diff).toBe(0);
    expect(second.diff).toBe(0);
    expect(second.movementId).toBe(first.movementId);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 5, inventoryValue: 4000 });
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, type: 'adjust' },
    })).toBe(0);
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.adjustment', sourceRef: { in: [first.movementId, second.movementId] } },
    })).toBe(0);
  });
});
