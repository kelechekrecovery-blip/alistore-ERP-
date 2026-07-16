import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError } from '../common/errors';
import { UnitsService } from '../units/units.service';
import { accrueConsignmentSalesOnTx, accrueQuantityConsignmentSalesOnTx } from './consignment-accounting';
import { consumeQuantityValuationOnTx } from './inventory-valuation';

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
  });
  for (const allocation of quantityAllocations) {
    const totalCost = await consumeQuantityValuationOnTx(tx, {
      orderId: input.orderId,
      allocationId: allocation.id,
      productId: allocation.productId,
      balanceId: allocation.balanceId,
      quantity: allocation.qty,
      actor: input.actor,
    });
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

  await tx.reservation.updateMany({
    where: { orderId: input.orderId, active: true },
    data: { active: false },
  });

  return { serialized: reservedUnits.length, quantityAllocations: quantityAllocations.length };
}
