import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OrderLineSupplyStatus, Prisma } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType, EventTypeValue } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CancelOrderLineSupplyDto, PlaceOrderLineSupplyDto } from './order-line-supply.dto';
import { assertTransition } from './order-line-supply-state';
import { UnitsService } from '../units/units.service';
import { handOverReadyOrderItemOnTx } from '../orders/order-item-handover-on-tx';
import { deriveOrderStatusFromLineFulfillment } from '../orders/order-state-machine';
import { FeatureFlagKey } from '../feature-flags/feature-flags.registry';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_LEAD_DAYS = 14;

function purchaseOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `PO-${date}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

/**
 * Slice 3 of docs/SUPPLY-TO-ORDER-PLAN.md: the supplier purchase order behind
 * a `to_order` customer order line. Advances `OrderLineSupply.status` through
 * `order-line-supply-state.ts` and, on the first transition, creates the
 * `PurchaseOrderItem` that makes the supplier order real.
 *
 * Every mutation is serialized with `pg_advisory_xact_lock` keyed on the
 * *customer* order id (docs/SUPPLY-TO-ORDER-PLAN.md, slice 3 note; house
 * pattern: `store-operations.service.ts:111`), so two staff clicking the same
 * line at once cannot create two supplier orders for it. `OrderLineSupply
 * .orderItemId` is `@unique`, and the transition that attaches
 * `purchaseOrderItemId` is a compare-and-swap `updateMany` guarded by the
 * previous status — a genuine race (lock notwithstanding) fails closed rather
 * than silently duplicating the purchase order line.
 */
@Injectable()
export class OrderLineSupplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  private async lockOrderForItem(tx: Prisma.TransactionClient, orderItemId: string): Promise<string> {
    const orderItem = await tx.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
    if (!orderItem) throw new ValidationError('order_item_not_found', `Строка заказа ${orderItemId} не найдена`);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'order-supply:' + orderItem.orderId}))::text AS locked`;
    return orderItem.orderId;
  }

  async placeSupplierOrder(orderItemId: string, dto: PlaceOrderLineSupplyDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const orderId = await this.lockOrderForItem(tx, orderItemId);
      const orderItem = await tx.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });
      const supply = await tx.orderLineSupply.findUnique({ where: { orderItemId } });
      if (!supply) {
        throw new ValidationError(
          'order_line_supply_not_found',
          `Строка ${orderItemId} не находится «под заказ» — нечего размещать у поставщика`,
        );
      }
      if (supply.status !== 'awaiting_supplier') {
        if (supply.purchaseOrderItemId) return { result: { ...supply, idempotent: true }, events: [] };
        assertTransition(supply.status, 'ordered');
      }

      const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new ValidationError('supplier_not_found', `Поставщик ${dto.supplierId} не найден`);
      const product = await tx.product.findUnique({ where: { sku: orderItem.sku } });
      if (!product) throw new ValidationError('product_not_found', `Товар ${orderItem.sku} не найден`);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { fulfillmentLocation: true } });
      if (!order.fulfillmentLocation?.trim()) {
        throw new ValidationError(
          'purchase_order_location_required',
          'У клиентского заказа не определён склад назначения',
        );
      }

      const expectedAt = dto.expectedAt
        ? new Date(dto.expectedAt)
        : new Date(Date.now() + (product.supplyLeadDays ?? DEFAULT_LEAD_DAYS) * MS_PER_DAY);

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          number: purchaseOrderNumber(),
          supplierId: supplier.id,
          location: order.fulfillmentLocation,
          createdBy: actor,
          note: `Под заказ покупателя: строка ${orderItemId}`,
          items: { create: [{ productId: product.id, orderedQty: orderItem.qty, unitCost: dto.unitCost }] },
        },
        include: { items: true },
      });
      const purchaseOrderItem = purchaseOrder.items[0];

      // Compare-and-swap on the previous status: this is the unique-constraint-
      // grade guard from 3a. The advisory lock already prevents a concurrent
      // caller from reaching this far, but a genuine race (or a future caller
      // that forgets the lock) fails this `count !== 1` check instead of
      // silently attaching a second PurchaseOrderItem to the same line.
      const cas = await tx.orderLineSupply.updateMany({
        where: { orderItemId, status: 'awaiting_supplier' },
        data: { status: 'ordered', purchaseOrderItemId: purchaseOrderItem.id, expectedAt, actor },
      });
      if (cas.count !== 1) {
        throw new ConflictError(
          'order_line_supply_race',
          `Заказ поставщику для строки ${orderItemId} уже размещён параллельно`,
        );
      }
      const updated = await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
      return {
        result: { ...updated, idempotent: false },
        events: [{
          type: EventType.OrderLineSupplyOrdered,
          actor,
          payload: {
            orderItemId,
            orderId,
            purchaseOrderId: purchaseOrder.id,
            purchaseOrderItemId: purchaseOrderItem.id,
            supplierId: supplier.id,
            unitCost: dto.unitCost,
            expectedAt: expectedAt.toISOString(),
          },
          refs: [orderId, orderItemId, purchaseOrder.id, purchaseOrderItem.id, supplier.id],
        }],
      };
    });
  }

  markInTransit(orderItemId: string, actor: string) {
    return this.transition(orderItemId, 'in_transit', actor, EventType.OrderLineSupplyInTransit);
  }

  markReceived(orderItemId: string, actor: string) {
    return this.transition(orderItemId, 'received', actor, EventType.OrderLineSupplyReceived);
  }

  markQualityChecked(orderItemId: string, actor: string) {
    return this.transition(
      orderItemId,
      'quality_check',
      actor,
      EventType.OrderLineSupplyQualityChecked,
    );
  }

  markReady(orderItemId: string, actor: string) {
    return this.transition(orderItemId, 'ready', actor, EventType.OrderLineSupplyReady);
  }

  async markHandedOver(orderItemId: string, actor: string) {
    if (!await this.featureFlags.isEnabled(FeatureFlagKey.PartialHandover)) {
      throw new ConflictError('supply_partial_handover_disabled', 'Построчная выдача пока не включена');
    }
    return this.transition(orderItemId, 'handed_over', actor, EventType.OrderLineSupplyHandedOver);
  }

  async cancel(orderItemId: string, dto: CancelOrderLineSupplyDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const orderId = await this.lockOrderForItem(tx, orderItemId);
      const supply = await tx.orderLineSupply.findUnique({ where: { orderItemId } });
      if (!supply) {
        throw new ValidationError('order_line_supply_not_found', `Строка ${orderItemId} не находится «под заказ»`);
      }
      if (supply.status === 'cancelled') return { result: { ...supply, idempotent: true }, events: [] };
      assertTransition(supply.status, 'cancelled');
      const cas = await tx.orderLineSupply.updateMany({
        where: { orderItemId, status: supply.status },
        data: { status: 'cancelled', actor },
      });
      if (cas.count !== 1) throw new ConflictError('order_line_supply_race', `Статус поставки строки ${orderItemId} изменился параллельно`);
      const updated = await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
      return {
        result: { ...updated, idempotent: false },
        events: [{
          type: EventType.OrderLineSupplyCancelled,
          actor,
          payload: { orderItemId, orderId, from: supply.status, reason: dto.reason?.trim() || null },
          refs: [orderId, orderItemId],
        }],
      };
    });
  }

  private async transition(orderItemId: string, to: OrderLineSupplyStatus, actor: string, eventType: EventTypeValue) {
    return this.audit.transaction(async (tx) => {
      const orderId = await this.lockOrderForItem(tx, orderItemId);
      const supply = await tx.orderLineSupply.findUnique({ where: { orderItemId } });
      if (!supply) {
        throw new ValidationError('order_line_supply_not_found', `Строка ${orderItemId} не находится «под заказ»`);
      }
      if (supply.status === to) return { result: { ...supply, idempotent: true }, events: [] };
      assertTransition(supply.status, to);
      if (to === 'received' && supply.receivedQty !== supply.orderedQty) {
        throw new ConflictError(
          'order_line_supply_receipt_incomplete',
          'Нельзя подтвердить поступление до фактической приёмки всего количества',
        );
      }
      if (to === 'handed_over') {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { paymentMode: true, status: true },
        });
        const events: AuditInput[] = [];
        const outcome = await handOverReadyOrderItemOnTx(tx, {
          orderId,
          orderItemId,
          paymentMode: order.paymentMode,
          actor,
          units: this.units,
          events,
        });
        const orderItems = await tx.orderItem.findMany({
          where: { orderId },
          select: { fulfillmentStatus: true },
        });
        const projectedStatus = deriveOrderStatusFromLineFulfillment(
          orderItems.map((item) => item.fulfillmentStatus),
        );
        if (projectedStatus === 'completed' && ['ready_for_pickup', 'delivered'].includes(order.status)) {
          await tx.order.update({ where: { id: orderId }, data: { status: 'completed' } });
        }
        return {
          result: {
            ...(await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } })),
            idempotent: false,
          },
          events,
        };
      }
      const cas = await tx.orderLineSupply.updateMany({
        where: { orderItemId, status: supply.status },
        data: { status: to, actor },
      });
      if (cas.count !== 1) throw new ConflictError('order_line_supply_race', `Статус поставки строки ${orderItemId} изменился параллельно`);
      const fulfillmentStatus = fulfillmentStatusForSupply(to);
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          fulfillmentStatus,
          ...(to === 'ready' ? { readyAt: new Date() } : {}),
        },
      });
      if (to === 'ready') {
        const orderItems = await tx.orderItem.findMany({
          where: { orderId },
          select: { fulfillmentStatus: true },
        });
        const projectedStatus = deriveOrderStatusFromLineFulfillment(
          orderItems.map((item) => item.fulfillmentStatus),
        );
        if (projectedStatus === 'ready_for_pickup') {
          const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
          if (order.status === 'confirmed') {
            await tx.order.update({ where: { id: orderId }, data: { status: 'ready_for_pickup' } });
          }
        }
      }
      const updated = await tx.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
      return {
        result: { ...updated, idempotent: false },
        events: [{
          type: eventType,
          actor,
          payload: { orderItemId, orderId, from: supply.status, to },
          refs: [orderId, orderItemId],
        }],
      };
    });
  }
}

function fulfillmentStatusForSupply(status: OrderLineSupplyStatus) {
  const statuses = {
    awaiting_deposit: 'awaiting_deposit',
    awaiting_supplier: 'awaiting_deposit',
    procurement_draft: 'procurement_draft',
    ordered: 'supplier_ordered',
    in_transit: 'in_transit',
    received: 'received',
    quality_check: 'quality_check',
    ready: 'ready',
    handed_over: 'handed_over',
    supplier_rejected: 'supplier_rejected',
    late: 'late',
    customer_cancelled: 'customer_cancelled',
    quarantined: 'quarantined',
    cancelled: 'cancelled',
  } as const;
  return statuses[status];
}
