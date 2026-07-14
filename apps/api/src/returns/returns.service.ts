import { Injectable } from '@nestjs/common';
import { Prisma, Return as ReturnRecord, ReturnStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';

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
    return this.prisma.return.findUnique({ where: { id } });
  }

  list(status?: string) {
    return this.prisma.return.findMany({
      where: status ? { status: status as ReturnStatus } : undefined,
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
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return returns.map((ret) => ({ ...ret, order: byId.get(ret.orderId)! }));
  }

  async request(orderId: string, reason: string, requester?: string, expectedCustomerId?: string, idempotencyKey?: string) {
    const key = idempotencyKey?.trim() || undefined;
    if (key) {
      const existing = await this.prisma.return.findUnique({ where: { idempotencyKey: key } });
      if (existing) return replayReturn(existing, orderId, reason);
    }
    return this.audit.transaction(async (tx) => {
      if (key) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'return:' + key}))::text AS locked`;
        const replay = await tx.return.findUnique({ where: { idempotencyKey: key } });
        if (replay) return { result: replayReturn(replay, orderId, reason), events: [] };
      }
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      if (expectedCustomerId && order.customerId !== expectedCustomerId) {
        throw new ForbiddenError('return_order_forbidden', 'Нельзя оформить возврат по чужому заказу');
      }
      const actor = requester ?? order.customerId;
      const ret = await tx.return.create({
        data: { orderId, reason, status: 'requested', idempotencyKey: key },
      });
      return {
        result: ret,
        events: [
          {
            type: EventType.ReturnRequested,
            actor,
            payload: { returnId: ret.id, orderId, reason },
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
        items: { select: { imei: true } },
        bundleAllocations: { select: { imei: true } },
        quantityAllocations: { where: { consumedAt: { not: null } } },
      },
    });
    if (!order) throw new ValidationError('order_not_found', `Заказ ${ret.orderId} не найден`);

    const events: Array<{ type: string; actor: string; payload: Record<string, unknown>; refs: string[] }> = [];
    const quantityByProduct = new Map<string, number>();
    for (const allocation of order.quantityAllocations) {
      quantityByProduct.set(
        allocation.productId,
        (quantityByProduct.get(allocation.productId) ?? 0) + allocation.qty,
      );
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

    const imeis = [
      ...order.items.flatMap((item) => item.imei ? [item.imei] : []),
      ...order.bundleAllocations.map((allocation) => allocation.imei),
    ];
    const consignments = await tx.consignmentItem.findMany({
      where: { saleOrderId: order.id },
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
        await tx.consignmentItem.update({ where: { id: item.id }, data: { status: 'withdrawn' } });
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

function replayReturn(ret: ReturnRecord, orderId: string, reason: string) {
  if (ret.orderId !== orderId || ret.reason !== reason) {
    throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим возвратом');
  }
  return ret;
}
