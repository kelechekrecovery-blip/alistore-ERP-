import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError } from '../common/errors';
import { UnitsService } from '../units/units.service';
import { accrueConsignmentSalesOnTx, accrueQuantityConsignmentSalesOnTx } from './consignment-accounting';
import { consumeQuantityValuationOnTx } from './inventory-valuation';

export interface OrderInventorySnapshot {
  productId: string;
  trackingMode: 'serialized' | 'quantity';
  components: Array<{
    productId: string;
    sku: string;
    trackingMode: 'serialized' | 'quantity';
    qty: number;
  }>;
}

export function parseOrderInventorySnapshot(value: Prisma.JsonValue | null): OrderInventorySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  if (
    typeof record.productId !== 'string'
    || (record.trackingMode !== 'serialized' && record.trackingMode !== 'quantity')
    || !Array.isArray(record.components)
  ) return null;
  const components = record.components.map((component) => {
    if (!component || typeof component !== 'object' || Array.isArray(component)) return null;
    const row = component as Record<string, Prisma.JsonValue>;
    if (
      typeof row.productId !== 'string'
      || typeof row.sku !== 'string'
      || (row.trackingMode !== 'serialized' && row.trackingMode !== 'quantity')
      || typeof row.qty !== 'number'
      || !Number.isInteger(row.qty)
      || row.qty <= 0
    ) return null;
    return { productId: row.productId, sku: row.sku, trackingMode: row.trackingMode, qty: row.qty };
  });
  if (components.some((component) => component === null)) return null;
  return {
    productId: record.productId,
    trackingMode: record.trackingMode,
    components: components as OrderInventorySnapshot['components'],
  };
}

export function resolveOrderInventorySnapshot(
  value: Prisma.JsonValue | null,
  fallback: OrderInventorySnapshot | null,
): OrderInventorySnapshot | null {
  if (value === null) return fallback;
  const snapshot = parseOrderInventorySnapshot(value);
  if (!snapshot) {
    throw new ConflictError('order_inventory_snapshot_invalid', 'Сохранённый складской снимок заказа повреждён');
  }
  return snapshot;
}

/**
 * Convert every active order reservation into an immutable sale. Payment and COD
 * delivery share this boundary so stock, consignment and COGS cannot diverge.
 */
export async function finalizeOrderInventorySaleOnTx(
  tx: Prisma.TransactionClient,
  input: { orderId: string; actor: string; units: UnitsService; events: AuditInput[] },
) {
  const reservedUnits = await tx.reservation.findMany({
    where: { orderId: input.orderId, active: true, imei: { not: null } },
    select: { imei: true },
    orderBy: { imei: 'asc' },
  });
  for (const reservation of reservedUnits) {
    if (!reservation.imei) continue;
    const valuation = await input.units.sellOnTx(tx, reservation.imei, input.orderId, input.actor);
    if (valuation?.entry) {
      input.events.push({
        type: EventType.AccountingEntryPosted,
        actor: input.actor,
        payload: {
          accountingEntryId: valuation.entry.id,
          sourceType: 'inventory.cogs',
          sourceRef: valuation.issue.id,
          amount: valuation.issue.totalCost,
        },
        refs: [valuation.entry.id, valuation.issue.id, input.orderId, reservation.imei],
      });
    }
    input.events.push({
      type: EventType.UnitSold,
      actor: input.actor,
      payload: { orderId: input.orderId, imei: reservation.imei },
      refs: [input.orderId, reservation.imei],
    });
  }
  await accrueConsignmentSalesOnTx(tx, {
    orderId: input.orderId,
    imeis: reservedUnits.flatMap((reservation) => reservation.imei ? [reservation.imei] : []),
    actor: input.actor,
    events: input.events,
  });

  const quantityAllocations = await tx.orderQuantityAllocation.findMany({
    where: { orderId: input.orderId, active: true },
    orderBy: [{ balanceId: 'asc' }, { id: 'asc' }],
  });
  await lockInventoryBalancesOnTx(tx, quantityAllocations.map((allocation) => allocation.balanceId));
  for (const allocation of quantityAllocations) {
    const quantityConsignments = await tx.quantityConsignmentAllocation.findMany({
      where: { orderQuantityAllocationId: allocation.id, status: 'active' },
      select: { qty: true },
    });
    const consignedQty = quantityConsignments.reduce((sum, item) => sum + item.qty, 0);
    if (consignedQty > allocation.qty) {
      throw new ConflictError('quantity_consignment_allocation_invalid', `Комиссионный резерв ${allocation.id} превышает продажу`);
    }
    const ownedQty = allocation.qty - consignedQty;
    const totalCost = ownedQty > 0
      ? await consumeQuantityValuationOnTx(tx, {
        orderId: input.orderId,
        allocationId: allocation.id,
        productId: allocation.productId,
        balanceId: allocation.balanceId,
        quantity: ownedQty,
        actor: input.actor,
      })
      : 0;
    const consumed = await tx.inventoryBalance.updateMany({
      where: {
        id: allocation.balanceId,
        onHand: { gte: allocation.qty },
        reserved: { gte: allocation.qty },
        inventoryValue: { gte: totalCost },
      },
      data: {
        onHand: { decrement: allocation.qty },
        reserved: { decrement: allocation.qty },
        inventoryValue: { decrement: totalCost },
      },
    });
    if (consumed.count !== 1) {
      throw new ConflictError('quantity_allocation_invalid', `Резерв ${allocation.id} больше недоступен`);
    }
    await tx.orderQuantityAllocation.update({
      where: { id: allocation.id },
      data: { active: false, consumedAt: new Date() },
    });
    input.events.push({
      type: EventType.StockSold,
      actor: input.actor,
      payload: {
        orderId: input.orderId,
        sku: allocation.sku,
        qty: allocation.qty,
        allocationId: allocation.id,
      },
      refs: [input.orderId, allocation.productId, allocation.id],
    });
  }
  await accrueQuantityConsignmentSalesOnTx(tx, {
    orderId: input.orderId,
    orderQuantityAllocationIds: quantityAllocations.map((allocation) => allocation.id),
    actor: input.actor,
    events: input.events,
  });

  await tx.orderBundleAllocation.updateMany({
    where: { orderId: input.orderId, active: true },
    data: { active: false, consumedAt: new Date() },
  });

  await tx.reservation.updateMany({
    where: { orderId: input.orderId, active: true },
    data: { active: false },
  });

  return { serialized: reservedUnits.length, quantityAllocations: quantityAllocations.length };
}

/**
 * Product rows are the explicit stock classification for legacy order lines.
 * Unknown SKUs remain compatible with historical non-stock/service fixtures, but
 * every line that resolves to a Product must have an exact reservation footprint.
 */
export async function orderHasTrackedInventoryOnTx(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<boolean> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { sku: true, inventorySnapshot: true },
  });
  if (items.length === 0) return false;
  for (const item of items) {
    if (item.inventorySnapshot !== null) {
      resolveOrderInventorySnapshot(item.inventorySnapshot, null);
      return true;
    }
  }
  const skus = [...new Set(items.map((item) => item.sku))];
  const products = await tx.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } });
  return products.length > 0;
}

export async function assertOrderReservationCoverageOnTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  now = new Date(),
  options: { enforceExpiry?: boolean } = {},
): Promise<{ serialized: number; quantity: number }> {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new ConflictError('order_not_found', `Заказ ${orderId} не найден`);
  if (order.items.length === 0) return { serialized: 0, quantity: 0 };

  const products = await tx.product.findMany({
    where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
    include: { bundleComponents: { include: { componentProduct: true } } },
  });
  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  const reservations = await tx.reservation.findMany({
    where: { orderId, active: true },
    include: { quantityAllocation: true },
  });
  if (options.enforceExpiry !== false && reservations.some((reservation) => reservation.expiresAt <= now)) {
    throw new ConflictError('order_reservation_expired', 'Резерв заказа истёк; выполните резервирование повторно');
  }
  const liveImeis = new Set(reservations.flatMap((reservation) => reservation.imei ? [reservation.imei] : []));
  const bundleAllocations = await tx.orderBundleAllocation.findMany({ where: { orderId, active: true } });
  const serializedImeis = [...new Set([
    ...liveImeis,
    ...bundleAllocations.map((allocation) => allocation.imei),
  ])];
  const reservedUnits = serializedImeis.length > 0
    ? await tx.deviceUnit.findMany({
      where: { imei: { in: serializedImeis } },
      select: { imei: true, productId: true, status: true, orderId: true },
    })
    : [];
  const reservedUnitsByImei = new Map(reservedUnits.map((unit) => [unit.imei, unit]));
  const isReservedUnit = (imei: string, productId: string) => {
    const unit = reservedUnitsByImei.get(imei);
    return liveImeis.has(imei)
      && unit?.productId === productId
      && unit.status === 'reserved'
      && unit.orderId === orderId;
  };
  const expectedImeis = new Set<string>();
  const expectedQuantityAllocationIds = new Set<string>();
  const expectedBundleAllocationIds = new Set<string>();
  let serialized = 0;
  let quantity = 0;

  const coverQuantity = (orderItemId: string, productId: string, required: number, sku: string) => {
    const matching = reservations.filter((reservation) => {
      const allocation = reservation.quantityAllocation;
      return allocation?.active && allocation.orderItemId === orderItemId && allocation.productId === productId;
    });
    if (matching.reduce((sum, reservation) => sum + (reservation.quantityAllocation?.qty ?? 0), 0) !== required) {
      throw incompleteReservation(orderId, sku);
    }
    for (const reservation of matching) expectedQuantityAllocationIds.add(reservation.quantityAllocation!.id);
    quantity += required;
  };

  for (const item of order.items) {
    const product = productsBySku.get(item.sku);
    const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
      productId: product.id,
      trackingMode: product.trackingMode,
      components: product.bundleComponents.map((component) => ({
        productId: component.componentProductId,
        sku: component.componentProduct.sku,
        trackingMode: component.componentProduct.trackingMode,
        qty: component.qty,
      })),
    } : null);
    if (!snapshot) continue; // explicit legacy non-stock/service line
    if (snapshot.components.length > 0) {
      for (const component of snapshot.components) {
        const required = item.qty * component.qty;
        if (component.trackingMode === 'quantity') {
          coverQuantity(item.id, component.productId, required, component.sku);
          continue;
        }
        const matching = bundleAllocations
          .filter((allocation) => allocation.orderItemId === item.id && allocation.componentProductId === component.productId);
        const allocatedImeis = matching.map((allocation) => allocation.imei);
        if (allocatedImeis.length !== required || allocatedImeis.some((imei) => !isReservedUnit(imei, component.productId))) {
          throw incompleteReservation(orderId, component.sku);
        }
        for (const allocation of matching) expectedBundleAllocationIds.add(allocation.id);
        for (const imei of allocatedImeis) expectedImeis.add(imei);
        serialized += required;
      }
      continue;
    }
    if (snapshot.trackingMode === 'quantity') {
      coverQuantity(item.id, snapshot.productId, item.qty, item.sku);
      continue;
    }
    if (!item.imei || item.qty !== 1 || !isReservedUnit(item.imei, snapshot.productId)) {
      throw incompleteReservation(orderId, item.sku);
    }
    expectedImeis.add(item.imei);
    serialized += 1;
  }
  const exactReservations = reservations.every((reservation) => reservation.imei
    ? expectedImeis.has(reservation.imei)
    : Boolean(reservation.quantityAllocationId && expectedQuantityAllocationIds.has(reservation.quantityAllocationId)));
  if (
    !exactReservations
    || reservations.length !== expectedImeis.size + expectedQuantityAllocationIds.size
    || bundleAllocations.length !== expectedBundleAllocationIds.size
  ) {
    throw incompleteReservation(orderId, 'inventory-footprint');
  }
  return { serialized, quantity };
}

export async function assertOrderInventoryFinalizedOnTx(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new ConflictError('order_not_found', `Заказ ${orderId} не найден`);
  if (order.items.length === 0) return;
  const products = await tx.product.findMany({
    where: { sku: { in: [...new Set(order.items.map((item) => item.sku))] } },
    include: { bundleComponents: { include: { componentProduct: true } } },
  });
  const productsBySku = new Map(products.map((product) => [product.sku, product]));
  const allocations = await tx.orderQuantityAllocation.findMany({
    where: { orderId, consumedAt: { not: null } },
    orderBy: [{ balanceId: 'asc' }, { id: 'asc' }],
  });
  const bundleAllocations = await tx.orderBundleAllocation.findMany({ where: { orderId, consumedAt: { not: null } } });
  const sold = await tx.deviceUnit.findMany({
    where: { orderId, status: 'sold' },
    select: {
      imei: true,
      productId: true,
      acquisitionCost: true,
      consignmentItem: {
        select: { id: true, status: true, saleOrderId: true, ownerAmount: true },
      },
    },
  });
  const valuationIssues = await tx.inventoryValuationIssue.findMany({
    where: { orderId },
    include: { layer: true },
  });
  const valuationEntries = valuationIssues.length > 0
    ? await tx.accountingJournalEntry.findMany({
      where: { sourceType: 'inventory.cogs', sourceRef: { in: valuationIssues.map((issue) => issue.id) } },
      include: { lines: true },
    })
    : [];
  const quantityConsignments = allocations.length > 0
    ? await tx.quantityConsignmentAllocation.findMany({
      where: { orderQuantityAllocationId: { in: allocations.map((allocation) => allocation.id) } },
    })
    : [];
  const consignmentRefs = [
    ...sold.flatMap((unit) => unit.consignmentItem ? [unit.consignmentItem.id] : []),
    ...quantityConsignments.map((allocation) => allocation.id),
  ];
  const consignmentEntries = consignmentRefs.length > 0
    ? await tx.accountingJournalEntry.findMany({
      where: {
        OR: [
          { sourceType: 'consignment.sale', sourceRef: { in: consignmentRefs } },
          { sourceType: 'quantity-consignment.sale', sourceRef: { in: consignmentRefs } },
        ],
      },
      include: { lines: true },
    })
    : [];
  const soldByImei = new Map(sold.map((unit) => [unit.imei, unit]));
  const expectedImeis = new Set<string>();
  const expectedQuantityAllocationIds = new Set<string>();
  const expectedBundleAllocationIds = new Set<string>();
  const expectedIssueIds = new Set<string>();
  const assertOwnedValuation = (
    issues: typeof valuationIssues,
    sku: string,
    expected: { productId: string; quantity: number; unitCost?: number; balanceId?: string },
  ) => {
    if (issues.length === 0) throw incompleteInventory(orderId, `${sku}:valuation`);
    if (issues.reduce((sum, issue) => sum + issue.quantity, 0) !== expected.quantity) {
      throw incompleteInventory(orderId, `${sku}:valuation-quantity`);
    }
    for (const issue of issues) {
      if (
        issue.sourceType !== 'sale'
        || issue.productId !== expected.productId
        || issue.quantity <= 0
        || issue.totalCost !== issue.quantity * issue.unitCost
        || (expected.unitCost !== undefined && issue.unitCost !== expected.unitCost)
        || (expected.balanceId !== undefined && (
          !issue.layer
          || issue.layerId !== issue.layer.id
          || issue.layer.balanceId !== expected.balanceId
          || issue.layer.productId !== expected.productId
          || issue.layer.unitCost !== issue.unitCost
        ))
      ) {
        throw incompleteInventory(orderId, `${sku}:valuation-source`);
      }
      expectedIssueIds.add(issue.id);
      assertExactAccounting(
        valuationEntries.filter((entry) => entry.sourceRef === issue.id),
        issue.totalCost,
        '5000',
        '1200',
        orderId,
        `${sku}:cogs`,
      );
    }
  };
  const assertConsignment = (
    rows: Array<{ id: string; status: string; saleOrderId: string | null; ownerAmount: number | null }>,
    sourceType: 'consignment.sale' | 'quantity-consignment.sale',
    sku: string,
  ) => {
    for (const row of rows) {
      if (row.status !== 'sold' || row.saleOrderId !== orderId || row.ownerAmount === null) {
        throw incompleteInventory(orderId, `${sku}:consignment`);
      }
      assertExactAccounting(
        consignmentEntries.filter((entry) => entry.sourceType === sourceType && entry.sourceRef === row.id),
        row.ownerAmount,
        '4000',
        '2000',
        orderId,
        `${sku}:consignment-accounting`,
      );
    }
  };
  const coverConsumedQuantity = (orderItemId: string, productId: string, required: number, sku: string) => {
    const matching = allocations.filter((allocation) => (
      allocation.orderItemId === orderItemId
      && allocation.productId === productId
      && !allocation.active
      && Boolean(allocation.consumedAt)
    ));
    if (matching.reduce((sum, allocation) => sum + allocation.qty, 0) !== required) {
      throw incompleteInventory(orderId, sku);
    }
    for (const allocation of matching) {
      expectedQuantityAllocationIds.add(allocation.id);
      const consignments = quantityConsignments.filter((row) => row.orderQuantityAllocationId === allocation.id);
      const consignmentQty = consignments.reduce((sum, row) => sum + row.qty, 0);
      const issues = valuationIssues.filter((issue) => issue.sourceRef.startsWith(`${orderId}:${allocation.id}:`));
      if (consignmentQty > allocation.qty) throw incompleteInventory(orderId, `${sku}:consignment-quantity`);
      const ownedQty = allocation.qty - consignmentQty;
      if (consignmentQty > 0) {
        assertConsignment(consignments, 'quantity-consignment.sale', sku);
      }
      if (ownedQty > 0) {
        assertOwnedValuation(issues, sku, {
          productId: allocation.productId,
          quantity: ownedQty,
          balanceId: allocation.balanceId,
        });
      } else if (issues.length > 0) throw incompleteInventory(orderId, `${sku}:valuation`);
    }
  };
  for (const item of order.items) {
    const product = productsBySku.get(item.sku);
    const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
      productId: product.id,
      trackingMode: product.trackingMode,
      components: product.bundleComponents.map((component) => ({
        productId: component.componentProductId,
        sku: component.componentProduct.sku,
        trackingMode: component.componentProduct.trackingMode,
        qty: component.qty,
      })),
    } : null);
    if (!snapshot) continue; // explicit legacy non-stock/service line
    if (snapshot.components.length > 0) {
      for (const component of snapshot.components) {
        const required = item.qty * component.qty;
        if (component.trackingMode === 'quantity') {
          coverConsumedQuantity(item.id, component.productId, required, component.sku);
        } else {
          const matching = bundleAllocations
            .filter((allocation) => allocation.orderItemId === item.id && allocation.componentProductId === component.productId);
          const imeis = matching.map((allocation) => allocation.imei);
          if (
            imeis.length !== required
            || imeis.some((imei) => soldByImei.get(imei)?.productId !== component.productId)
          ) throw incompleteInventory(orderId, component.sku);
          for (const allocation of matching) expectedBundleAllocationIds.add(allocation.id);
          for (const imei of imeis) {
            const soldUnit = soldByImei.get(imei)!;
            if (soldUnit.consignmentItem) {
              if (valuationIssues.some((issue) => issue.imei === imei)) {
                throw incompleteInventory(orderId, `${component.sku}:valuation`);
              }
              assertConsignment([soldUnit.consignmentItem], 'consignment.sale', component.sku);
            } else {
              if (soldUnit.acquisitionCost === null) throw incompleteInventory(orderId, `${component.sku}:acquisition-cost`);
              assertOwnedValuation(
                valuationIssues.filter((issue) => issue.imei === imei && issue.sourceRef === `${orderId}:${imei}`),
                component.sku,
                {
                  productId: soldUnit.productId,
                  quantity: 1,
                  unitCost: soldUnit.acquisitionCost,
                },
              );
            }
            expectedImeis.add(imei);
          }
        }
      }
    } else if (snapshot.trackingMode === 'quantity') {
      coverConsumedQuantity(item.id, snapshot.productId, item.qty, item.sku);
    } else {
      const soldUnit = item.imei ? soldByImei.get(item.imei) : undefined;
      if (!item.imei || item.qty !== 1 || soldUnit?.productId !== snapshot.productId) {
        throw incompleteInventory(orderId, item.sku);
      }
      if (soldUnit.consignmentItem) {
        const strayIssues = valuationIssues.filter((issue) => issue.imei === item.imei);
        if (strayIssues.length > 0) throw incompleteInventory(orderId, `${item.sku}:valuation`);
        assertConsignment([soldUnit.consignmentItem], 'consignment.sale', item.sku);
      } else {
        if (soldUnit.acquisitionCost === null) throw incompleteInventory(orderId, `${item.sku}:acquisition-cost`);
        assertOwnedValuation(
          valuationIssues.filter((issue) => issue.imei === item.imei && issue.sourceRef === `${orderId}:${item.imei}`),
          item.sku,
          {
            productId: soldUnit.productId,
            quantity: 1,
            unitCost: soldUnit.acquisitionCost,
          },
        );
      }
      expectedImeis.add(item.imei);
    }
  }
  if (allocations.length !== expectedQuantityAllocationIds.size || bundleAllocations.length !== expectedBundleAllocationIds.size) {
    throw incompleteInventory(orderId, 'inventory-footprint');
  }
  if (sold.length !== expectedImeis.size || sold.some((unit) => !expectedImeis.has(unit.imei))) {
    throw incompleteInventory(orderId, 'serialized');
  }
  if (valuationIssues.length !== expectedIssueIds.size || valuationIssues.some((issue) => !expectedIssueIds.has(issue.id))) {
    throw incompleteInventory(orderId, 'valuation-footprint');
  }
}

function assertExactAccounting(
  entries: Array<{ lines: Array<{ accountCode: string; debit: number; credit: number }> }>,
  amount: number,
  debitAccount: string,
  creditAccount: string,
  orderId: string,
  label: string,
): void {
  if (amount === 0) {
    if (entries.length !== 0) throw incompleteInventory(orderId, label);
    return;
  }
  if (amount < 0 || entries.length !== 1) throw incompleteInventory(orderId, label);
  const lines = entries[0].lines;
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  const exactDebit = lines.filter((line) => line.accountCode === debitAccount).reduce((sum, line) => sum + line.debit, 0);
  const exactCredit = lines.filter((line) => line.accountCode === creditAccount).reduce((sum, line) => sum + line.credit, 0);
  if (debit !== amount || credit !== amount || exactDebit !== amount || exactCredit !== amount) {
    throw incompleteInventory(orderId, label);
  }
}

export async function lockInventoryBalancesOnTx(tx: Prisma.TransactionClient, balanceIds: string[]): Promise<void> {
  const ids = [...new Set(balanceIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id
    FROM "InventoryBalance"
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR UPDATE
  `);
}

function incompleteReservation(orderId: string, sku: string): ConflictError {
  return new ConflictError('order_reservation_incomplete', `Резерв заказа ${orderId} не покрывает ${sku}`);
}

function incompleteInventory(orderId: string, sku: string): ConflictError {
  return new ConflictError('order_inventory_unfinalized', `Складское списание заказа ${orderId} не покрывает ${sku}`);
}
