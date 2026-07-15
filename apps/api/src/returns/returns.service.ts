import { Injectable } from '@nestjs/common';
import { Prisma, Return as ReturnRecord, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import type { ReturnSelectionDto } from './returns.dto';
import { reverseInventoryCostOnTx, reverseQuantityCostOnTx } from '../inventory/inventory-valuation';
import { postConsignmentReturnAccountingOnTx } from '../inventory/consignment-accounting';

type ReturnWithItems = Prisma.ReturnGetPayload<{ include: { items: true } }>;

/**
 * Return requests (Return state machine). Recording a return is separate from the
 * money: the actual refund is an approval-gated action on the payment
 * (PaymentsService.refund), so a return moving to `paid` reflects an approved,
 * executed refund — the ledger stays the single source of truth.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(id: string) {
    return this.prisma.return.findUnique({ where: { id }, include: { items: true } });
  }

  list(status?: string) {
    return this.prisma.return.findMany({
      where: status ? { status: status as ReturnStatus } : undefined,
      include: {
        items: true,
        order: {
          select: {
            id: true,
            total: true,
            items: { select: { id: true, sku: true, qty: true, price: true } },
            payments: { where: { amount: { gt: 0 } }, select: { id: true, amount: true, method: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listByCustomer(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      select: { id: true, total: true, createdAt: true, items: true },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    const returns = await this.prisma.return.findMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return returns.map((ret) => ({ ...ret, order: byId.get(ret.orderId)! }));
  }

  async request(
    orderId: string,
    reason: string,
    requester?: string,
    expectedCustomerId?: string,
    idempotencyKey?: string,
    selections?: ReturnSelectionDto[],
  ) {
    const key = idempotencyKey?.trim() || undefined;
    if (key) {
      const existing = await this.prisma.return.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
      if (existing) return replayReturn(existing, orderId, reason, selections);
    }
    return this.audit.transaction(async (tx) => {
      if (key) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'return:' + key}))::text AS locked`;
        const replay = await tx.return.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
        if (replay) return { result: replayReturn(replay, orderId, reason, selections), events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      if (expectedCustomerId && order.customerId !== expectedCustomerId) {
        throw new ForbiddenError('return_order_forbidden', 'Нельзя оформить возврат по чужому заказу');
      }
      const actor = requester ?? order.customerId;
      const previous = await tx.return.findMany({
        where: { orderId, status: { not: 'rejected' } },
        include: { items: true },
      });
      const quote = buildReturnQuote(order, previous, selections);
      const ret = await tx.return.create({
        data: {
          orderId,
          reason,
          status: 'requested',
          idempotencyKey: key,
          refundAmount: quote.refundAmount,
          isFullOrder: quote.isFullOrder,
          items: {
            create: quote.items.map((item) => ({
              orderItemId: item.orderItemId,
              qty: item.qty,
              refundAmount: item.refundAmount,
            })),
          },
        },
        include: { items: true },
      });
      return {
        result: ret,
        events: [
          {
            type: EventType.ReturnRequested,
            actor,
            payload: { returnId: ret.id, orderId, reason, refundAmount: ret.refundAmount, isFullOrder: ret.isFullOrder, items: ret.items.map((item) => ({ orderItemId: item.orderItemId, qty: item.qty })) },
            refs: [ret.id, orderId],
          },
        ],
      };
    });
  }

  async transition(id: string, status: ReturnStatus, actor: string, location?: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Return" WHERE id = ${id} FOR UPDATE`;
      const ret = await tx.return.findUnique({ where: { id } });
      if (!ret) {
        throw new ValidationError('return_not_found', `Возврат ${id} не найден`);
      }
      if (ret.status === status) {
        return { result: ret, events: [] };
      }
      if (status === 'paid') {
        throw new ConflictError('return_paid_by_refund_only', 'Статус paid устанавливает только выполненный refund');
      }
      if (!RETURN_TRANSITIONS[ret.status].has(status)) {
        throw new ConflictError(
          'invalid_return_transition',
          `Переход возврата ${ret.status} → ${status} запрещён`,
        );
      }
      if (status === 'reconciled') {
        return this.reconcileOnTx(tx, ret, actor, location);
      }
      const updated = await tx.return.update({ where: { id }, data: { status } });
      return {
        result: updated,
        events: [
          {
            type: `return.${status}`,
            actor,
            payload: { returnId: id, from: ret.status, to: status },
            refs: [id, ret.orderId],
          },
        ],
      };
    });
  }

  private async reconcileOnTx(
    tx: Prisma.TransactionClient,
    ret: ReturnRecord,
    actor: string,
    requestedLocation?: string,
  ) {
    const location = requestedLocation?.trim();
    if (!location) {
      throw new ValidationError('return_location_required', 'Укажите склад возврата');
    }
    const order = await tx.order.findUnique({
      where: { id: ret.orderId },
      include: {
        items: { select: { id: true, sku: true, qty: true, imei: true } },
        bundleAllocations: { select: { id: true, orderItemId: true, componentProductId: true, imei: true } },
        quantityAllocations: { where: { consumedAt: { not: null } } },
      },
    });
    if (!order) throw new ValidationError('order_not_found', `Заказ ${ret.orderId} не найден`);
    const storedReturnItems = await tx.returnItem.findMany({ where: { returnId: ret.id } });
    const selectedQty = new Map<string, number>();
    if (storedReturnItems.length === 0 && ret.isFullOrder) {
      for (const item of order.items) selectedQty.set(item.id, item.qty);
    } else {
      for (const item of storedReturnItems) selectedQty.set(item.orderItemId, item.qty);
    }

    const events: Array<{ type: string; actor: string; payload: Record<string, unknown>; refs: string[] }> = [];
    const quantityByProduct = new Map<string, number>();
    const returnedQuantityAllocations: Array<{ id: string; productId: string; qty: number }> = [];
    for (const item of order.items) {
      let remaining = selectedQty.get(item.id) ?? 0;
      const allocations = order.quantityAllocations
        .filter((allocation) => allocation.orderItemId === item.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (allocations.length === 0) continue;
      for (const allocation of allocations) {
        if (remaining === 0) break;
        const available = allocation.qty - allocation.returnedQty;
        const qty = Math.min(available, remaining);
        if (qty <= 0) continue;
        const changed = await tx.orderQuantityAllocation.updateMany({
          where: { id: allocation.id, returnedQty: allocation.returnedQty },
          data: { returnedQty: { increment: qty } },
        });
        if (changed.count !== 1) throw new ConflictError('return_quantity_conflict', 'Остаток возврата изменён параллельно');
        quantityByProduct.set(allocation.productId, (quantityByProduct.get(allocation.productId) ?? 0) + qty);
        returnedQuantityAllocations.push({ id: allocation.id, productId: allocation.productId, qty });
        remaining -= qty;
      }
      if (remaining > 0) {
        throw new ConflictError('return_quantity_state_mismatch', `Недостаточно списанного количества для позиции ${item.sku}`);
      }
    }
    for (const [productId, qty] of quantityByProduct) {
      await tx.inventoryBalance.upsert({
        where: { productId_location: { productId, location } },
        create: { productId, location, onHand: qty },
        update: { onHand: { increment: qty } },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          idempotencyKey: `return:${ret.id}:quantity:${productId}:${location}`,
          productId,
          qty,
          type: 'return_restock',
          to: location,
          reason: ret.reason,
        },
      });
      events.push({
        type: EventType.StockReceived,
        actor,
        payload: { returnId: ret.id, orderId: order.id, productId, qty, location, movementId: movement.id },
        refs: [ret.id, order.id, productId, movement.id],
      });
    }

    for (const returned of returnedQuantityAllocations) {
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: { productId_location: { productId: returned.productId, location } },
      });
      const valuation = await reverseQuantityCostOnTx(tx, {
        orderId: order.id,
        allocationId: returned.id,
        productId: returned.productId,
        balanceId: balance.id,
        quantity: returned.qty,
        returnId: ret.id,
        actor,
      });
      if (valuation.totalCost > 0) {
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { inventoryValue: { increment: valuation.totalCost } },
        });
      }
    }

    for (const returned of returnedQuantityAllocations) {
      let remaining = returned.qty;
      const quantityConsignments = await tx.quantityConsignmentAllocation.findMany({
        where: {
          saleOrderId: order.id,
          orderQuantityAllocationId: returned.id,
          status: { in: ['sold', 'settled'] },
        },
        include: { lot: true, payout: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const allocation of quantityConsignments) {
        if (remaining === 0) break;
        const qty = Math.min(allocation.qty - allocation.returnedQty, remaining);
        if (qty <= 0) continue;
        const nextReturnedQty = allocation.returnedQty + qty;
        const saleAmount = proportionalDelta(
          allocation.salePrice ?? 0,
          allocation.qty,
          allocation.returnedQty,
          nextReturnedQty,
        );
        const commissionAmount = proportionalDelta(
          allocation.commissionAmount ?? 0,
          allocation.qty,
          allocation.returnedQty,
          nextReturnedQty,
        );
        const ownerAmount = proportionalDelta(
          allocation.ownerAmount ?? 0,
          allocation.qty,
          allocation.returnedQty,
          nextReturnedQty,
        );
        const targetBalance = await tx.inventoryBalance.findUniqueOrThrow({
          where: { productId_location: { productId: allocation.lot.productId, location } },
        });
        await tx.quantityConsignmentLot.create({
          data: {
            idempotencyKey: `return:${ret.id}:quantity-consignment:${allocation.id}`,
            productId: allocation.lot.productId,
            balanceId: targetBalance.id,
            location,
            ownerName: allocation.lot.ownerName,
            ownerContact: allocation.lot.ownerContact,
            commissionBps: allocation.lot.commissionBps,
            receivedQty: qty,
            availableQty: qty,
            createdBy: actor,
          },
        });
        if (allocation.payout?.status === 'paid') {
          await tx.quantityConsignmentAdjustment.create({
            data: {
              returnId: ret.id,
              allocationId: allocation.id,
              payoutId: allocation.payout.id,
              ownerName: allocation.lot.ownerName,
              ownerContact: allocation.lot.ownerContact,
              amount: ownerAmount,
              reason: `Возврат заказа ${order.id} после выплаты владельцу`,
              createdBy: actor,
            },
          });
          const accountingEntry = await postConsignmentReturnAccountingOnTx(tx, {
            returnId: ret.id,
            sourceRef: `quantity:${allocation.id}`,
            ownerAmount,
            payoutPaid: true,
            actor,
          });
          if (accountingEntry) events.push({
            type: EventType.AccountingEntryPosted,
            actor,
            payload: { accountingEntryId: accountingEntry.id, sourceType: 'consignment.return.owner_receivable', sourceRef: `${ret.id}:quantity:${allocation.id}`, amount: ownerAmount },
            refs: [accountingEntry.id, ret.id, allocation.id],
          });
          events.push({
            type: EventType.ConsignmentAdjustmentCreated,
            actor,
            payload: {
              returnId: ret.id,
              quantityConsignmentAllocationId: allocation.id,
              payoutId: allocation.payout.id,
              amount: ownerAmount,
            },
            refs: [ret.id, allocation.id, allocation.payout.id, allocation.lot.id],
          });
        } else if (allocation.payout) {
          const currentPayout = await tx.consignmentPayout.findUniqueOrThrow({
            where: { id: allocation.payout.id },
          });
          const nextOwnerAmount = Math.max(0, currentPayout.ownerAmount - ownerAmount);
          await tx.consignmentPayout.update({
            where: { id: allocation.payout.id },
            data: {
              grossAmount: Math.max(0, currentPayout.grossAmount - saleAmount),
              commissionAmount: Math.max(0, currentPayout.commissionAmount - commissionAmount),
              ownerAmount: nextOwnerAmount,
              status: nextOwnerAmount === 0 ? 'cancelled' : 'created',
            },
          });
        }
        if (allocation.payout?.status !== 'paid') {
          const accountingEntry = await postConsignmentReturnAccountingOnTx(tx, {
            returnId: ret.id,
            sourceRef: `quantity:${allocation.id}`,
            ownerAmount,
            payoutPaid: false,
            actor,
          });
          if (accountingEntry) events.push({
            type: EventType.AccountingEntryPosted,
            actor,
            payload: { accountingEntryId: accountingEntry.id, sourceType: 'consignment.return.unpaid_reversal', sourceRef: `${ret.id}:quantity:${allocation.id}`, amount: ownerAmount },
            refs: [accountingEntry.id, ret.id, allocation.id],
          });
        }
        await tx.quantityConsignmentAllocation.update({
          where: { id: allocation.id },
          data: {
            returnedQty: nextReturnedQty,
            returnedSaleAmount: { increment: saleAmount },
            returnedCommissionAmount: { increment: commissionAmount },
            returnedOwnerAmount: { increment: ownerAmount },
            status: nextReturnedQty === allocation.qty ? 'withdrawn' : allocation.status,
            returnedAt: new Date(),
            payoutId: allocation.payout?.status === 'paid' ? allocation.payout.id : allocation.payoutId,
          },
        });
        events.push({
          type: EventType.ConsignmentReturned,
          actor,
          payload: {
            returnId: ret.id,
            quantityConsignmentAllocationId: allocation.id,
            qty,
            location,
            payoutStatus: allocation.payout?.status ?? null,
          },
          refs: [ret.id, allocation.id, allocation.lot.id, order.id],
        });
        remaining -= qty;
      }
    }

    const imeis = order.items.flatMap((item) => selectedQty.has(item.id) && item.imei ? [item.imei] : []);
    const soldBundleImeis = new Set((await tx.deviceUnit.findMany({
      where: {
        imei: { in: order.bundleAllocations.map((allocation) => allocation.imei) },
        orderId: order.id,
        status: 'sold',
      },
      select: { imei: true },
    })).map((unit) => unit.imei));
    for (const item of order.items) {
      const qty = selectedQty.get(item.id) ?? 0;
      if (qty === 0) continue;
      const allocations = order.bundleAllocations.filter((allocation) => allocation.orderItemId === item.id);
      const perComponent = new Map<string, typeof allocations>();
      for (const allocation of allocations) {
        const list = perComponent.get(allocation.componentProductId) ?? [];
        list.push(allocation);
        perComponent.set(allocation.componentProductId, list);
      }
      for (const list of perComponent.values()) {
        const perBundle = list.length / item.qty;
        const selected = list.filter((allocation) => soldBundleImeis.has(allocation.imei)).slice(0, qty * perBundle);
        if (!Number.isInteger(perBundle) || selected.length !== qty * perBundle) {
          throw new ConflictError('return_bundle_state_mismatch', `Недостаточно проданных компонентов набора ${item.sku}`);
        }
        imeis.push(...selected.map((allocation) => allocation.imei));
      }
    }
    const consignments = await tx.consignmentItem.findMany({
      where: { saleOrderId: order.id, unit: { imei: { in: imeis } } },
      include: { unit: true, payout: true },
    });
    const consignmentImeis = new Set(consignments.map((item) => item.unit.imei));
    const regularImeis = imeis.filter((imei) => !consignmentImeis.has(imei));
    if (regularImeis.length > 0) {
      const restored = await tx.deviceUnit.updateMany({
        where: { imei: { in: regularImeis }, orderId: order.id, status: 'sold' },
        data: { status: 'in_stock', location, orderId: null },
      });
      if (restored.count !== regularImeis.length) {
        throw new ConflictError(
          'return_unit_state_mismatch',
          'Не все серийные товары заказа находятся в статусе sold',
        );
      }
      for (const imei of regularImeis) {
        const issue = await tx.inventoryValuationIssue.findFirst({
          where: { imei, sourceType: 'sale', orderId: order.id, reversedQty: 0 },
          orderBy: { createdAt: 'desc' },
        });
        if (issue) await reverseInventoryCostOnTx(tx, { issueId: issue.id, quantity: 1, returnId: ret.id, actor });
        events.push({
          type: EventType.UnitReturned,
          actor,
          payload: { returnId: ret.id, orderId: order.id, imei, location },
          refs: [ret.id, order.id, imei],
        });
      }
    }

    for (const item of consignments) {
      if (item.status !== 'sold' && item.status !== 'settled') {
        throw new ConflictError(
          'return_consignment_state_mismatch',
          `Комиссионная позиция ${item.id} уже ${item.status}`,
        );
      }
      if (item.payout?.status === 'paid') {
        await tx.consignmentAdjustment.upsert({
          where: { returnId_itemId: { returnId: ret.id, itemId: item.id } },
          create: {
            returnId: ret.id,
            itemId: item.id,
            payoutId: item.payout.id,
            ownerName: item.ownerName,
            ownerContact: item.ownerContact,
            amount: item.ownerAmount ?? 0,
            reason: `Возврат заказа ${order.id} после выплаты владельцу`,
            createdBy: actor,
          },
          update: {},
        });
        const accountingEntry = await postConsignmentReturnAccountingOnTx(tx, {
          returnId: ret.id,
          sourceRef: `serialized:${item.id}`,
          ownerAmount: item.ownerAmount ?? 0,
          payoutPaid: true,
          actor,
        });
        if (accountingEntry) events.push({
          type: EventType.AccountingEntryPosted,
          actor,
          payload: { accountingEntryId: accountingEntry.id, sourceType: 'consignment.return.owner_receivable', sourceRef: `${ret.id}:serialized:${item.id}`, amount: item.ownerAmount ?? 0 },
          refs: [accountingEntry.id, ret.id, item.id],
        });
        await tx.consignmentItem.update({
          where: { id: item.id },
          data: { status: 'withdrawn', saleOrderId: null },
        });
        await tx.deviceUnit.update({
          where: { id: item.unitId },
          data: { status: 'returned', location, orderId: null },
        });
        events.push({
          type: EventType.ConsignmentAdjustmentCreated,
          actor,
          payload: {
            returnId: ret.id,
            consignmentItemId: item.id,
            payoutId: item.payout.id,
            amount: item.ownerAmount ?? 0,
          },
          refs: [ret.id, item.id, item.payout.id, item.unit.imei],
        });
      } else {
        if (item.payout) {
          const currentPayout = await tx.consignmentPayout.findUniqueOrThrow({ where: { id: item.payout.id } });
          const grossAmount = Math.max(0, currentPayout.grossAmount - (item.salePrice ?? 0));
          const commissionAmount = Math.max(0, currentPayout.commissionAmount - (item.commissionAmount ?? 0));
          const ownerAmount = Math.max(0, currentPayout.ownerAmount - (item.ownerAmount ?? 0));
          await tx.consignmentPayout.update({
            where: { id: item.payout.id },
            data: {
              grossAmount,
              commissionAmount,
              ownerAmount,
              status: ownerAmount === 0 ? 'cancelled' : 'created',
            },
          });
        }
        const accountingEntry = await postConsignmentReturnAccountingOnTx(tx, {
          returnId: ret.id,
          sourceRef: `serialized:${item.id}`,
          ownerAmount: item.ownerAmount ?? 0,
          payoutPaid: false,
          actor,
        });
        if (accountingEntry) events.push({
          type: EventType.AccountingEntryPosted,
          actor,
          payload: { accountingEntryId: accountingEntry.id, sourceType: 'consignment.return.unpaid_reversal', sourceRef: `${ret.id}:serialized:${item.id}`, amount: item.ownerAmount ?? 0 },
          refs: [accountingEntry.id, ret.id, item.id],
        });
        await tx.consignmentItem.update({
          where: { id: item.id },
          data: {
            status: 'active',
            saleOrderId: null,
            salePrice: null,
            commissionAmount: null,
            ownerAmount: null,
            soldAt: null,
            payoutId: null,
          },
        });
        await tx.deviceUnit.update({
          where: { id: item.unitId },
          data: { status: 'in_stock', location, orderId: null },
        });
      }
      events.push({
        type: EventType.ConsignmentReturned,
        actor,
        payload: {
          returnId: ret.id,
          consignmentItemId: item.id,
          imei: item.unit.imei,
          location,
          payoutStatus: item.payout?.status ?? null,
        },
        refs: [ret.id, item.id, item.unit.imei],
      });
    }

    const updated = await tx.return.update({
      where: { id: ret.id },
      data: { status: 'reconciled', restockLocation: location, restockedAt: new Date() },
    });
    events.push({
      type: EventType.ReturnCompleted,
      actor,
      payload: {
        returnId: ret.id,
        orderId: order.id,
        location,
        quantityProducts: quantityByProduct.size,
        serializedUnits: imeis.length,
      },
      refs: [ret.id, order.id],
    });
    return { result: updated, events };
  }
}

const RETURN_TRANSITIONS: Record<ReturnStatus, ReadonlySet<ReturnStatus>> = {
  requested: new Set(['under_review', 'rejected']),
  under_review: new Set(['approved', 'rejected']),
  approved: new Set(['processing', 'rejected']),
  rejected: new Set(),
  processing: new Set(),
  paid: new Set(['reconciled']),
  reconciled: new Set(),
};

function proportionalDelta(total: number, qty: number, beforeQty: number, afterQty: number) {
  if (qty <= 0) return 0;
  return Math.floor((total * afterQty) / qty) - Math.floor((total * beforeQty) / qty);
}

type ReturnOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;

function buildReturnQuote(
  order: ReturnOrder,
  previous: ReturnWithItems[],
  selections?: ReturnSelectionDto[],
) {
  if (order.items.length === 0) {
    throw new ValidationError('return_order_empty', 'В заказе нет позиций для возврата');
  }
  const orderedItems = [...order.items].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(orderedItems.map((item) => [item.id, item]));
  const returnedByItem = new Map<string, number>();
  for (const ret of previous) {
    if (ret.items.length === 0 && ret.isFullOrder) {
      for (const item of orderedItems) returnedByItem.set(item.id, item.qty);
      continue;
    }
    for (const item of ret.items) {
      returnedByItem.set(item.orderItemId, (returnedByItem.get(item.orderItemId) ?? 0) + item.qty);
    }
  }

  const requested = selections?.length
    ? selections
    : orderedItems
        .map((item) => ({ orderItemId: item.id, qty: item.qty - (returnedByItem.get(item.id) ?? 0) }))
        .filter((item) => item.qty > 0);
  if (requested.length === 0) {
    throw new ConflictError('return_nothing_remaining', 'Все позиции заказа уже оформлены на возврат');
  }

  const requestedByItem = new Map<string, number>();
  for (const selection of requested) {
    const item = byId.get(selection.orderItemId);
    if (!item) {
      throw new ValidationError('return_item_not_found', `Позиция ${selection.orderItemId} не относится к заказу`);
    }
    const qty = Number(selection.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new ValidationError('return_item_qty_invalid', 'Количество возврата должно быть положительным целым числом');
    }
    requestedByItem.set(item.id, (requestedByItem.get(item.id) ?? 0) + qty);
  }
  for (const [itemId, qty] of requestedByItem) {
    const item = byId.get(itemId)!;
    const remaining = item.qty - (returnedByItem.get(itemId) ?? 0);
    if (qty > remaining) {
      throw new ConflictError('return_item_qty_exceeded', `Для позиции ${item.sku} доступно к возврату: ${remaining}`);
    }
  }

  const gross = orderedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const merchandiseNet = Math.max(0, Math.min(gross, order.total - order.deliveryFee));
  let allocated = 0;
  const netByItem = new Map<string, number>();
  orderedItems.forEach((item, index) => {
    const lineGross = item.price * item.qty;
    const lineNet = index === orderedItems.length - 1
      ? merchandiseNet - allocated
      : gross === 0 ? 0 : Math.floor((lineGross * merchandiseNet) / gross);
    allocated += lineNet;
    netByItem.set(item.id, lineNet);
  });

  const items = [...requestedByItem.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([orderItemId, qty]) => {
    const item = byId.get(orderItemId)!;
    const oldQty = returnedByItem.get(orderItemId) ?? 0;
    const lineNet = netByItem.get(orderItemId) ?? 0;
    const before = Math.floor((lineNet * oldQty) / item.qty);
    const after = Math.floor((lineNet * (oldQty + qty)) / item.qty);
    return { orderItemId, qty, refundAmount: after - before };
  });
  const cumulativeComplete = orderedItems.every((item) =>
    (returnedByItem.get(item.id) ?? 0) + (requestedByItem.get(item.id) ?? 0) === item.qty,
  );
  if (cumulativeComplete && order.deliveryFee > 0) {
    items[items.length - 1].refundAmount += order.deliveryFee;
  }
  const isFullOrder = previous.length === 0 && orderedItems.every((item) => requestedByItem.get(item.id) === item.qty);
  return {
    items,
    isFullOrder,
    refundAmount: items.reduce((sum, item) => sum + item.refundAmount, 0),
  };
}

function replayReturn(
  ret: ReturnWithItems,
  orderId: string,
  reason: string,
  selections?: ReturnSelectionDto[],
) {
  if (ret.orderId !== orderId || ret.reason !== reason) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим возвратом');
  }
  if (selections?.length) {
    const existing = ret.items
      .map((item) => `${item.orderItemId}:${item.qty}`)
      .sort()
      .join('|');
    const requested = selections
      .map((item) => `${item.orderItemId}:${item.qty}`)
      .sort()
      .join('|');
    if (existing !== requested) {
      throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим составом возврата');
    }
  }
  return ret;
}
