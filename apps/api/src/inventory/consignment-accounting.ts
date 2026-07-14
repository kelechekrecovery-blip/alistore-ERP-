import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError } from '../common/errors';

/** Accrue the immutable owner liability when a serialized consignment unit is sold. */
export async function accrueConsignmentSalesOnTx(
  tx: Prisma.TransactionClient,
  input: { orderId: string; imeis: string[]; actor: string; events: AuditInput[] },
): Promise<void> {
  if (input.imeis.length === 0) return;
  const [consignments, lines] = await Promise.all([
    tx.consignmentItem.findMany({
      where: { status: 'active', unit: { imei: { in: input.imeis } } },
      include: { unit: { select: { imei: true } } },
    }),
    tx.orderItem.findMany({
      where: { orderId: input.orderId, imei: { in: input.imeis } },
      select: { imei: true, price: true },
    }),
  ]);
  const priceByImei = new Map(lines.flatMap((line) => line.imei ? [[line.imei, line.price] as const] : []));

  for (const item of consignments) {
    const salePrice = priceByImei.get(item.unit.imei);
    if (salePrice === undefined) continue;
    const commissionAmount = Math.floor((salePrice * item.commissionBps) / 10_000);
    const ownerAmount = salePrice - commissionAmount;
    const accrued = await tx.consignmentItem.updateMany({
      where: { id: item.id, status: 'active' },
      data: {
        status: 'sold',
        saleOrderId: input.orderId,
        salePrice,
        commissionAmount,
        ownerAmount,
        soldAt: new Date(),
      },
    });
    if (accrued.count === 1) {
      input.events.push({
        type: EventType.ConsignmentSold,
        actor: input.actor,
        payload: {
          consignmentItemId: item.id,
          orderId: input.orderId,
          imei: item.unit.imei,
          salePrice,
          commissionAmount,
          ownerAmount,
        },
        refs: [item.id, input.orderId, item.unit.imei, item.productId],
      });
    }
  }
}

/** Attribute a quantity reservation to third-party lots without replacing InventoryBalance as stock truth. */
export async function reserveQuantityConsignmentOnTx(
  tx: Prisma.TransactionClient,
  input: { orderQuantityAllocationId: string; balanceId: string; qty: number },
): Promise<void> {
  const lots = await tx.quantityConsignmentLot.findMany({
    where: { balanceId: input.balanceId, availableQty: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.qty;
  for (const lot of lots) {
    if (remaining === 0) break;
    const desired = Math.min(remaining, lot.availableQty);
    const claimed = await tx.quantityConsignmentLot.updateMany({
      where: { id: lot.id, availableQty: { gte: desired } },
      data: { availableQty: { decrement: desired }, reservedQty: { increment: desired } },
    });
    if (claimed.count !== 1) {
      throw new ConflictError('quantity_consignment_reservation_conflict', `Партия ${lot.id} изменилась во время резерва`);
    }
    await tx.quantityConsignmentAllocation.create({
      data: {
        lotId: lot.id,
        orderQuantityAllocationId: input.orderQuantityAllocationId,
        qty: desired,
      },
    });
    remaining -= desired;
  }
}

/** Release owner attribution when an aggregate quantity reservation is cancelled or expires. */
export async function releaseQuantityConsignmentOnTx(
  tx: Prisma.TransactionClient,
  orderQuantityAllocationId: string,
): Promise<void> {
  const allocations = await tx.quantityConsignmentAllocation.findMany({
    where: { orderQuantityAllocationId, status: 'active' },
  });
  for (const allocation of allocations) {
    const released = await tx.quantityConsignmentLot.updateMany({
      where: { id: allocation.lotId, reservedQty: { gte: allocation.qty } },
      data: { reservedQty: { decrement: allocation.qty }, availableQty: { increment: allocation.qty } },
    });
    if (released.count !== 1) {
      throw new ConflictError('quantity_consignment_release_conflict', `Резерв партии ${allocation.lotId} повреждён`);
    }
    await tx.quantityConsignmentAllocation.update({
      where: { id: allocation.id },
      data: { status: 'withdrawn' },
    });
  }
}

/** Turn reserved owner attribution into an immutable owner liability on sale. */
export async function accrueQuantityConsignmentSalesOnTx(
  tx: Prisma.TransactionClient,
  input: { orderId: string; orderQuantityAllocationIds: string[]; actor: string; events: AuditInput[] },
): Promise<void> {
  if (input.orderQuantityAllocationIds.length === 0) return;
  const allocations = await tx.quantityConsignmentAllocation.findMany({
    where: {
      orderQuantityAllocationId: { in: input.orderQuantityAllocationIds },
      status: 'active',
    },
    include: {
      lot: true,
      orderQuantityAllocation: { select: { orderItemId: true } },
    },
  });
  const orderItemIds = [...new Set(allocations.map((allocation) => allocation.orderQuantityAllocation.orderItemId))];
  const lines = await tx.orderItem.findMany({
    where: { id: { in: orderItemIds }, orderId: input.orderId },
    select: { id: true, price: true },
  });
  const priceByItem = new Map(lines.map((line) => [line.id, line.price]));

  for (const allocation of allocations) {
    const unitPrice = priceByItem.get(allocation.orderQuantityAllocation.orderItemId);
    if (unitPrice === undefined) {
      throw new ConflictError('quantity_consignment_order_line_missing', `Строка заказа для распределения ${allocation.id} не найдена`);
    }
    const salePrice = unitPrice * allocation.qty;
    const commissionAmount = Math.floor((salePrice * allocation.lot.commissionBps) / 10_000);
    const ownerAmount = salePrice - commissionAmount;
    const lotUpdated = await tx.quantityConsignmentLot.updateMany({
      where: { id: allocation.lotId, reservedQty: { gte: allocation.qty } },
      data: { reservedQty: { decrement: allocation.qty } },
    });
    if (lotUpdated.count !== 1) {
      throw new ConflictError('quantity_consignment_sale_conflict', `Резерв партии ${allocation.lotId} нельзя продать`);
    }
    const accrued = await tx.quantityConsignmentAllocation.updateMany({
      where: { id: allocation.id, status: 'active' },
      data: {
        status: 'sold',
        saleOrderId: input.orderId,
        salePrice,
        commissionAmount,
        ownerAmount,
        soldAt: new Date(),
      },
    });
    if (accrued.count !== 1) {
      throw new ConflictError('quantity_consignment_sale_conflict', `Распределение ${allocation.id} уже изменено`);
    }
    input.events.push({
      type: EventType.ConsignmentSold,
      actor: input.actor,
      payload: {
        quantityConsignmentAllocationId: allocation.id,
        lotId: allocation.lotId,
        orderId: input.orderId,
        qty: allocation.qty,
        salePrice,
        commissionAmount,
        ownerAmount,
      },
      refs: [allocation.id, allocation.lotId, input.orderId, allocation.lot.productId],
    });
  }
}

/** Move the owner-attributed portion of an aggregate transfer to matching destination lots. */
export async function transferQuantityConsignmentOnTx(
  tx: Prisma.TransactionClient,
  input: { movementId: string; sourceBalanceId: string; destinationBalanceId: string; destination: string; qty: number; actor: string },
): Promise<number> {
  const lots = await tx.quantityConsignmentLot.findMany({
    where: { balanceId: input.sourceBalanceId, availableQty: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  let remaining = input.qty;
  let moved = 0;
  for (const lot of lots) {
    if (remaining === 0) break;
    const desired = Math.min(remaining, lot.availableQty);
    const claimed = await tx.quantityConsignmentLot.updateMany({
      where: { id: lot.id, availableQty: { gte: desired } },
      data: { availableQty: { decrement: desired } },
    });
    if (claimed.count !== 1) {
      throw new ConflictError('quantity_consignment_transfer_conflict', `Партия ${lot.id} изменилась во время перемещения`);
    }
    await tx.quantityConsignmentLot.create({
      data: {
        idempotencyKey: `transfer:${input.movementId}:${lot.id}`,
        productId: lot.productId,
        balanceId: input.destinationBalanceId,
        location: input.destination,
        ownerName: lot.ownerName,
        ownerContact: lot.ownerContact,
        commissionBps: lot.commissionBps,
        receivedQty: desired,
        availableQty: desired,
        createdBy: input.actor,
      },
    });
    remaining -= desired;
    moved += desired;
  }
  return moved;
}
