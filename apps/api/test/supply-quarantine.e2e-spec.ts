import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupplyQuarantineService } from '../src/procurement/supply-quarantine.service';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';

describe('Supply quarantine resolution', () => {
  const prefix = `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let prisma: PrismaService;
  let service: SupplyQuarantineService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const flags = new FeatureFlagsService(
      prisma,
      new ConfigService({ SUPPLY_QUARANTINE_CONVERSION_ENABLED: 'true' }),
      audit,
    );
    service = new SupplyQuarantineService(prisma, audit, flags);
  });

  beforeEach(() => clean());
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  async function clean() {
    const products = await prisma.product.findMany({
      where: { sku: { startsWith: prefix } },
      select: { id: true },
    });
    const productIds = products.map(({ id }) => id);
    if (!productIds.length) return;
    const orders = await prisma.orderItem.findMany({
      where: { productId: { in: productIds } },
      select: { orderId: true },
    });
    const orderIds = [...new Set(orders.map(({ orderId }) => orderId))];
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: [...productIds, ...orderIds] } } });
    await prisma.deviceUnit.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.supplyQuantityAllocation.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryValuationIssue.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.supplyQuarantineResolution.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryValuationLayer.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.orderLineSupply.deleteMany({ where: { orderItem: { productId: { in: productIds } } } });
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { sourceOrderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { phone: { startsWith: '+99655577' } } });
    await prisma.supplier.deleteMany({ where: { name: { startsWith: prefix } } });
  }

  async function receivedSupply(trackingMode: 'quantity' | 'serialized', qty: number) {
    seq += 1;
    const supplier = await prisma.supplier.create({ data: { name: `${prefix}-supplier-${seq}` } });
    const product = await prisma.product.create({
      data: {
        sku: `${prefix}-${trackingMode}-${seq}`,
        name: 'Quarantine product',
        price: 50_000,
        cost: 30_000,
        category: 'test',
        trackingMode,
        supplyMode: 'to_order',
        supplyLeadDays: 7,
        supplierId: supplier.id,
        attrs: {},
      },
    });
    const customer = await prisma.customer.create({
      data: { phone: `+99655577${seq.toString().padStart(4, '0')}`, name: 'Quarantine buyer' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        status: 'confirmed',
        total: 50_000 * qty,
        fulfillmentLocation: 'BISHKEK-1',
        storePointId: 'alistore-bishkek-1',
        items: {
          create: {
            productId: product.id,
            sku: product.sku,
            qty,
            price: 50_000,
            unitCost: 30_000,
            supplyModeSnapshot: 'to_order',
            supplierIdSnapshot: supplier.id,
            supplyLeadDaysSnapshot: 7,
            fulfillmentStatus: 'received',
          },
        },
      },
      include: { items: true },
    });
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        number: `${prefix}-PO-${seq}`,
        supplierId: supplier.id,
        sourceOrderId: order.id,
        sourceKey: `${prefix}-source-${seq}`,
        status: 'received',
        location: 'BISHKEK-1',
        createdBy: 'warehouse',
        receivedAt: new Date(),
        items: {
          create: {
            productId: product.id,
            orderedQty: qty,
            receivedQty: qty,
            unitCost: 30_000,
          },
        },
      },
      include: { items: true },
    });
    const supply = await prisma.orderLineSupply.create({
      data: {
        orderItemId: order.items[0].id,
        purchaseOrderItemId: purchaseOrder.items[0].id,
        status: 'received',
        orderedQty: qty,
        receivedQty: qty,
        actor: 'warehouse',
      },
    });
    if (trackingMode === 'quantity') {
      const receipt = await prisma.purchaseReceipt.create({
        data: {
          purchaseOrderId: purchaseOrder.id,
          idempotencyKey: `${prefix}-receipt-${seq}`,
          actor: 'warehouse',
          payload: [{ itemId: purchaseOrder.items[0].id, qty }],
        },
      });
      await prisma.supplyQuantityAllocation.create({
        data: {
          orderLineSupplyId: supply.id,
          purchaseReceiptId: receipt.id,
          productId: product.id,
          location: 'BISHKEK-1',
          qty,
          unitCost: 30_000,
        },
      });
    }
    const imeis = trackingMode === 'serialized'
      ? Array.from({ length: qty }, (_, index) => `${seq}`.padStart(4, '0') + `${index}`.padStart(11, '0'))
      : [];
    if (imeis.length) {
      await prisma.deviceUnit.createMany({
        data: imeis.map((imei) => ({
          imei,
          productId: product.id,
          status: 'reserved',
          location: 'BISHKEK-1',
          orderId: order.id,
          acquisitionCost: 30_000,
        })),
      });
    }
    return { product, order, orderItem: order.items[0], supply, imeis };
  }

  it('blocks quarantine before physical receipt and for non-to-order snapshots', async () => {
    const fixture = await receivedSupply('quantity', 1);
    await prisma.orderLineSupply.update({
      where: { id: fixture.supply.id },
      data: { receivedQty: 0, status: 'in_transit' },
    });
    await expect(service.propose(
      fixture.orderItem.id,
      { reason: 'Клиент отказался', evidence: { ticket: 'SUP-1' } },
      'warehouse',
      `${prefix}-before-receipt`,
    )).rejects.toMatchObject({ code: 'supply_quarantine_not_physically_received' });

    await prisma.orderItem.update({
      where: { id: fixture.orderItem.id },
      data: {
        supplyModeSnapshot: 'own_stock',
        supplierIdSnapshot: null,
        supplyLeadDaysSnapshot: null,
      },
    });
    await expect(service.propose(
      fixture.orderItem.id,
      { reason: 'Клиент отказался', evidence: { ticket: 'SUP-2' } },
      'warehouse',
      `${prefix}-own-stock`,
    )).rejects.toMatchObject({ code: 'supply_quarantine_requires_to_order' });
  });

  it('quarantines serialized IMEI, denies unauthorized resolution, and converts exactly once', async () => {
    const fixture = await receivedSupply('serialized', 2);
    const proposed = await service.propose(
      fixture.orderItem.id,
      { reason: 'Отказ покупателя после поставки', evidence: { ticket: 'SUP-3' }, imeis: fixture.imeis },
      'warehouse',
      `${prefix}-serialized-propose`,
    );
    expect(proposed).toMatchObject({ status: 'pending', quarantinedQty: 2, idempotent: false });
    expect((proposed as Record<string, unknown>).unitCostSnapshot).toBeUndefined();
    expect((proposed as Record<string, unknown>).supplierId).toBeUndefined();
    expect(await prisma.deviceUnit.count({
      where: { productId: fixture.product.id, status: 'in_stock' },
    })).toBe(0);
    expect(await prisma.deviceUnit.count({
      where: { productId: fixture.product.id, status: 'quarantined' },
    })).toBe(2);
    await expect(service.resolve(
      proposed.id,
      { disposition: 'convert_to_own_stock', reason: 'Перевести в продажу', evidence: { decision: 'OWN-1' } },
      'warehouse',
      'warehouse',
      `${prefix}-serialized-resolve-denied`,
    )).rejects.toMatchObject({ code: 'supply_quarantine_owner_required' });
    await expect(service.resolve(
      proposed.id,
      { disposition: 'convert_to_own_stock', reason: '  ', evidence: {} },
      'owner-1',
      'owner',
      `${prefix}-serialized-resolve-invalid`,
    )).rejects.toMatchObject({ code: 'supply_quarantine_reason_required' });
    await expect(service.resolve(
      proposed.id,
      { disposition: 'convert_to_own_stock', reason: 'Перевести в продажу', evidence: {} },
      'owner-1',
      'owner',
      `${prefix}-serialized-resolve-no-evidence`,
    )).rejects.toMatchObject({ code: 'supply_quarantine_evidence_required' });

    const command = () => service.resolve(
      proposed.id,
      { disposition: 'convert_to_own_stock', reason: 'Перевести в собственный склад', evidence: { decision: 'OWN-2' } },
      'owner-1',
      'owner',
      `${prefix}-serialized-resolve`,
    );
    const [left, right] = await Promise.all([command(), command()]);
    expect([left.idempotent, right.idempotent].sort()).toEqual([false, true]);
    expect(await prisma.inventoryMovement.count({
      where: { productId: fixture.product.id, type: 'to_order_conversion' },
    })).toBe(1);
    expect(await prisma.deviceUnit.count({
      where: { productId: fixture.product.id, status: 'in_stock', orderId: null },
    })).toBe(2);
    expect(await prisma.inventoryBalance.count({ where: { productId: fixture.product.id } })).toBe(0);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: fixture.product.id } }))
      .toMatchObject({ supplyMode: 'own_stock' });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: fixture.orderItem.id } }))
      .toMatchObject({ supplyModeSnapshot: 'to_order', fulfillmentStatus: 'cancelled' });
  });

  it('returns serialized units to supplier without creating free stock or movement', async () => {
    const fixture = await receivedSupply('serialized', 1);
    const proposed = await service.propose(
      fixture.orderItem.id,
      { reason: 'Отказ покупателя', evidence: { ticket: 'SUP-4' }, imeis: fixture.imeis },
      'warehouse',
      `${prefix}-return-propose`,
    );
    const resolved = await service.resolve(
      proposed.id,
      { disposition: 'return_to_supplier', reason: 'Возврат по согласованию', evidence: { rma: 'RMA-1' } },
      'admin-1',
      'admin',
      `${prefix}-return-resolve`,
    );
    expect(resolved).toMatchObject({ status: 'resolved', disposition: 'return_to_supplier', inventoryMovementId: null });
    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei: fixture.imeis[0] } }))
      .toMatchObject({ status: 'returned_supplier', orderId: fixture.order.id });
    expect(await prisma.inventoryBalance.count({ where: { productId: fixture.product.id } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { productId: fixture.product.id } })).toBe(0);
  });

  it('converts quantity allocation into exact balance, value layer, and one movement', async () => {
    const fixture = await receivedSupply('quantity', 3);
    const proposed = await service.propose(
      fixture.orderItem.id,
      { reason: 'Покупатель отказался', evidence: { ticket: 'SUP-5' } },
      'warehouse',
      `${prefix}-quantity-propose`,
    );
    const first = await service.resolve(
      proposed.id,
      { disposition: 'convert_to_own_stock', reason: 'Добавить в свободный склад', evidence: { decision: 'OWN-3' } },
      'owner-1',
      'owner',
      `${prefix}-quantity-resolve`,
    );
    const replay = await service.resolve(
      proposed.id,
      { disposition: 'convert_to_own_stock', reason: 'Добавить в свободный склад', evidence: { decision: 'OWN-3' } },
      'owner-1',
      'owner',
      `${prefix}-quantity-resolve`,
    );
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: fixture.product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 3, reserved: 0, inventoryValue: 90_000 });
    expect(await prisma.inventoryValuationLayer.findFirstOrThrow({
      where: { productId: fixture.product.id, sourceType: 'supply_quarantine_conversion' },
    })).toMatchObject({ quantityReceived: 3, quantityRemaining: 3, unitCost: 30_000 });
    expect(await prisma.inventoryMovement.count({
      where: { productId: fixture.product.id, type: 'to_order_conversion', qty: 3 },
    })).toBe(1);
    expect(await prisma.supplyQuantityAllocation.findFirstOrThrow({
      where: { orderLineSupplyId: fixture.supply.id },
    })).toMatchObject({ active: false, consumedAt: expect.any(Date), valuationIssueId: expect.any(String) });
  });

  it('returns a quantity allocation to supplier without creating a balance', async () => {
    const fixture = await receivedSupply('quantity', 2);
    const proposed = await service.propose(
      fixture.orderItem.id,
      { reason: 'Покупатель отказался', evidence: { ticket: 'SUP-6' } },
      'warehouse',
      `${prefix}-quantity-return-propose`,
    );
    await service.resolve(
      proposed.id,
      { disposition: 'return_to_supplier', reason: 'Поставщик принял возврат', evidence: { rma: 'RMA-2' } },
      'owner-1',
      'owner',
      `${prefix}-quantity-return-resolve`,
    );
    expect(await prisma.inventoryBalance.count({ where: { productId: fixture.product.id } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { productId: fixture.product.id } })).toBe(0);
    expect(await prisma.supplyQuantityAllocation.findFirstOrThrow({
      where: { orderLineSupplyId: fixture.supply.id },
    })).toMatchObject({ active: false, consumedAt: expect.any(Date), valuationIssueId: expect.any(String) });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: fixture.product.id } }))
      .toMatchObject({ supplyMode: 'to_order' });
  });
});
