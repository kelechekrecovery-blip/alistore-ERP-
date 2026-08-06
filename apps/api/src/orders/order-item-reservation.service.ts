import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { reserveQuantityConsignmentOnTx } from '../inventory/consignment-accounting';
import { lockInventoryBalancesOnTx, resolveOrderInventorySnapshot } from '../inventory/order-inventory-sale';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { deriveOrderStatusFromLineFulfillment } from './order-state-machine';
import { FeatureFlagKey } from '../feature-flags/feature-flags.registry';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

const READY_RESERVATION_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class OrderItemReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly outbox: OutboxService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async reserve(orderId: string, orderItemId: string, actor: string, key: string) {
    await this.assertEnabled();
    return this.command(orderId, orderItemId, actor, key, 'reserve', async (tx, order, item, events) => {
      if (item.fulfillmentStatus === 'reserved' || item.fulfillmentStatus === 'ready') {
        return item;
      }
      if (item.fulfillmentStatus !== 'pending_payment') {
        throw new ConflictError('order_item_not_reservable', `Строка нельзя зарезервировать из статуса ${item.fulfillmentStatus}`);
      }
      const product = item.product;
      const snapshot = resolveOrderInventorySnapshot(item.inventorySnapshot, product ? {
        productId: product.id,
        trackingMode: product.trackingMode,
        components: [],
      } : null);
      if (!snapshot || snapshot.components.length > 0) {
        throw new ConflictError('order_item_inventory_snapshot_unsupported', 'Для построчного резерва нужен обычный складской товар');
      }
      const expiresAt = new Date(Date.now() + READY_RESERVATION_TTL_MS);
      if (snapshot.trackingMode === 'serialized') {
        if (item.qty !== 1) {
          throw new ConflictError(
            'serialized_line_split_required',
            'Серийная строка количеством больше одной должна быть разделена до построчного резерва',
          );
        }
        const unit = await tx.deviceUnit.findFirst({
          where: { productId: snapshot.productId, location: order.fulfillmentLocation!, status: 'in_stock' },
          orderBy: { id: 'asc' },
        });
        if (!unit) throw new ConflictError('insufficient_stock', `Нет доступной единицы ${item.sku}`);
        await this.units.reserveOnTx(tx, unit.imei, orderId);
        await tx.reservation.create({ data: { orderId, imei: unit.imei, expiresAt, active: true } });
        await tx.orderItem.update({ where: { id: item.id }, data: { imei: unit.imei } });
        events.push({
          type: EventType.StockReserved,
          actor,
          payload: { orderId, orderItemId, imei: unit.imei, location: order.fulfillmentLocation },
          refs: [orderId, orderItemId, unit.imei],
        });
      } else {
        const balances = await tx.inventoryBalance.findMany({
          where: { productId: snapshot.productId, location: order.fulfillmentLocation! },
          orderBy: { id: 'asc' },
        });
        await lockInventoryBalancesOnTx(tx, balances.map((balance) => balance.id));
        let remaining = item.qty;
        for (const balance of balances) {
          if (remaining === 0) break;
          const qty = Math.min(remaining, Math.max(0, balance.onHand - balance.reserved));
          if (qty === 0) continue;
          const claimed = await tx.inventoryBalance.updateMany({
            where: { id: balance.id, onHand: { gte: balance.reserved + qty } },
            data: { reserved: { increment: qty } },
          });
          if (claimed.count !== 1) continue;
          const allocation = await tx.orderQuantityAllocation.create({
            data: {
              orderId,
              orderItemId,
              productId: snapshot.productId,
              balanceId: balance.id,
              sku: item.sku,
              location: balance.location,
              qty,
            },
          });
          await reserveQuantityConsignmentOnTx(tx, {
            orderQuantityAllocationId: allocation.id,
            balanceId: balance.id,
            qty,
          });
          await tx.reservation.create({
            data: { orderId, quantityAllocationId: allocation.id, expiresAt, active: true },
          });
          remaining -= qty;
          events.push({
            type: EventType.StockReserved,
            actor,
            payload: { orderId, orderItemId, sku: item.sku, qty, location: balance.location },
            refs: [orderId, orderItemId, allocation.id],
          });
        }
        if (remaining > 0) throw new ConflictError('insufficient_stock', `Недостаточно товара ${item.sku}`);
      }
      return tx.orderItem.update({
        where: { id: item.id },
        data: { fulfillmentStatus: 'reserved' },
      });
    });
  }

  async ready(orderId: string, orderItemId: string, actor: string, key: string) {
    await this.assertEnabled();
    return this.command(orderId, orderItemId, actor, key, 'ready', async (tx, order, item, events) => {
      if (item.fulfillmentStatus === 'ready') return item;
      if (item.fulfillmentStatus !== 'reserved') {
        throw new ConflictError('order_item_not_readyable', `Строка нельзя подготовить из статуса ${item.fulfillmentStatus}`);
      }
      const reservations = await tx.reservation.findMany({
        where: {
          orderId,
          active: true,
          OR: [
            ...(item.imei ? [{ imei: item.imei }] : []),
            { quantityAllocation: { is: { orderItemId } } },
          ],
        },
        select: { id: true },
      });
      if (reservations.length === 0) {
        throw new ConflictError('order_item_reservation_incomplete', 'Активный резерв строки не найден');
      }
      const readyAt = new Date();
      const expiresAt = new Date(readyAt.getTime() + READY_RESERVATION_TTL_MS);
      await tx.reservation.updateMany({
        where: { id: { in: reservations.map((row) => row.id) }, active: true },
        data: { expiresAt },
      });
      const updated = await tx.orderItem.update({
        where: { id: orderItemId },
        data: { fulfillmentStatus: 'ready', readyAt },
      });
      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { fulfillmentStatus: true },
      });
      const projectedStatus = deriveOrderStatusFromLineFulfillment(
        orderItems.map((item) => item.fulfillmentStatus),
      );
      if (projectedStatus === 'ready_for_pickup' && order.status === 'confirmed') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'ready_for_pickup' } });
      }
      await enqueueConsentedCustomerNotice(tx, this.outbox, {
        customerId: order.customerId,
        template: 'order_ready_for_pickup',
        payload: { orderId, orderItemId, expiresAt: expiresAt.toISOString() },
        transactional: true,
      });
      events.push({
        type: EventType.OrderItemReady,
        actor,
        payload: { orderId, orderItemId, readyAt: readyAt.toISOString(), expiresAt: expiresAt.toISOString() },
        refs: [orderId, orderItemId],
      });
      return updated;
    });
  }

  private async assertEnabled() {
    if (!await this.featureFlags.isEnabled(FeatureFlagKey.PartialHandover)) {
      throw new ConflictError('supply_partial_handover_disabled', 'Построчная выдача пока не включена');
    }
  }

  private command(
    orderId: string,
    orderItemId: string,
    actor: string,
    idempotencyKey: string,
    action: 'reserve' | 'ready',
    work: (
      tx: Prisma.TransactionClient,
      order: {
        id: string;
        customerId: string;
        status: string;
        fulfillmentLocation: string | null;
      },
      item: Prisma.OrderItemGetPayload<{ include: { product: true } }>,
      events: AuditInput[],
    ) => Promise<unknown>,
  ) {
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) throw new ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    const fingerprint = JSON.stringify({ action, actor, orderId, orderItemId });
    return this.audit.transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order-item-lifecycle:' + key}))`;
      const replay = await tx.storeOperationCommand.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.resourceType !== `order-item.${action}` || replay.resourceId !== orderItemId || replay.fingerprint !== fingerprint) {
          throw new ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой операцией');
        }
        return { result: replay.response, events: [] };
      }
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          customerId: true,
          status: true,
          isDemo: true,
          fulfillmentType: true,
          fulfillmentLocation: true,
          storePoint: { select: { active: true, inventoryLocation: true } },
        },
      });
      if (!order) throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      if (order.isDemo) throw new ValidationError('demo_order_blocked', 'Демо-заказ нельзя резервировать');
      if (!['pickup', 'store'].includes(order.fulfillmentType)) {
        throw new ConflictError('order_item_reservation_pickup_only', 'Построчный резерв доступен только для самовывоза');
      }
      const activeLocation = order.storePoint?.active
        && order.storePoint.inventoryLocation === order.fulfillmentLocation;
      if (!activeLocation) throw new ConflictError('store_point_inactive', 'Точка исполнения неактивна или изменилась');
      const item = await tx.orderItem.findFirst({
        where: { id: orderItemId, orderId },
        include: { product: true },
      });
      if (!item) throw new ValidationError('order_item_not_found', `Строка ${orderItemId} не найдена`);
      if (item.supplyModeSnapshot !== 'own_stock') {
        throw new ConflictError('order_item_supply_managed', 'Заказная строка управляется поставочным процессом');
      }
      const events: AuditInput[] = [];
      const result = await work(tx, order, item, events);
      const response = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
      await tx.storeOperationCommand.create({
        data: { idempotencyKey: key, resourceType: `order-item.${action}`, resourceId: orderItemId, fingerprint, response },
      });
      return { result, events };
    });
  }
}
