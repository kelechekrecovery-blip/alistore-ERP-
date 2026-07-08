import { Injectable, Optional } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';
import { ConflictError, ValidationError } from '../common/errors';
import { assertTransition } from './order-state-machine';
import { CreateOrderDto } from './orders.dto';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';

/** Reservation lifetime — every reservation must have expiresAt (invariant #7). */
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 минут

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  get(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
  }

  /** Orders belonging to one customer, newest first (personal account). */
  listByCustomer(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Ledger events for one order, scoped by the controller before this is called. */
  ledger(orderId: string) {
    return this.prisma.auditEvent.findMany({
      where: { refs: { has: orderId } },
      orderBy: { ts: 'desc' },
      take: 50,
    });
  }

  /** Create an order (status `created`) and write order.created to the ledger. */
  async create(dto: CreateOrderDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          channel: dto.channel,
          total: dto.total,
          status: 'created',
          items: {
            create: dto.items.map((i) => ({
              sku: i.sku,
              qty: i.qty,
              price: i.price,
              imei: i.imei,
            })),
          },
        },
        include: { items: true },
      });
      if (this.outbox) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: order.customerId,
          template: 'order_confirmed',
          payload: { orderId: order.id, channel: order.channel, total: order.total },
        });
      }
      return {
        result: order,
        events: [
          {
            type: EventType.OrderCreated,
            actor,
            payload: { orderId: order.id, channel: order.channel, total: order.total },
            refs: [order.id],
          },
        ],
      };
    });
  }

  /**
   * Reserve stock for the order: each IMEI item locks its unit (in_stock → reserved)
   * with a bounded-life Reservation, then the order moves to `reserved`.
   * A unit that is already reserved or sold blocks the reservation (409) — this is
   * where the double-sale guard fires for a second order on the same IMEI.
   */
  async reserve(orderId: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      assertTransition(order.status, 'reserved');

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const events: AuditInput[] = [];
      for (const item of order.items) {
        if (!item.imei) continue;
        await this.units.reserveOnTx(tx, item.imei, orderId);
        await tx.reservation.create({
          data: { orderId, imei: item.imei, expiresAt, active: true },
        });
        events.push({
          type: EventType.StockReserved,
          actor,
          payload: { orderId, imei: item.imei },
          refs: [orderId, item.imei],
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'reserved' },
      });
      events.push({
        type: EventType.OrderReserved,
        actor,
        payload: { orderId },
        refs: [orderId],
      });
      return { result: updated, events };
    });
  }

  /** Generic guarded status transition (writes an order.* ledger event). */
  async transition(orderId: string, to: OrderStatus, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      assertTransition(order.status, to);
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: to },
      });
      if (this.outbox && (to === 'confirmed' || to === 'ready_for_pickup')) {
        await enqueueConsentedCustomerNotice(tx, this.outbox, {
          customerId: order.customerId,
          template: to === 'confirmed' ? 'order_confirmed' : 'order_ready',
          payload: { orderId, from: order.status, to },
        });
      }
      return {
        result: updated,
        events: [
          {
            type: `order.${to}`,
            actor,
            payload: { orderId, from: order.status, to },
            refs: [orderId],
          },
        ],
      };
    });
  }

  /** Orders in a given status, newest first — staff fulfillment queue. */
  listByStatus(status: OrderStatus, limit = 50) {
    return this.prisma.order.findMany({
      where: { status },
      include: { items: true, customer: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Warehouse fulfillment: assign concrete in_stock IMEI units to a web order's
   * serialized lines (which arrive without an IMEI), then move it to `reserved`.
   * A serialized line with qty>1 is normalized to one unit per line (like POS), so
   * every physical device is tracked individually. Insufficient stock → 409.
   */
  async fulfill(orderId: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      assertTransition(order.status, 'reserved');

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      const events: AuditInput[] = [];
      const assigned: string[] = [];

      const reserveUnit = async (imei: string, sku: string) => {
        await tx.deviceUnit.update({
          where: { imei },
          data: { status: 'reserved', orderId },
        });
        await tx.reservation.create({ data: { orderId, imei, expiresAt, active: true } });
        assigned.push(imei);
        events.push({
          type: EventType.StockReserved,
          actor,
          payload: { orderId, imei, sku },
          refs: [orderId, imei],
        });
      };

      for (const item of order.items) {
        if (item.imei) {
          // already serialized (e.g. POS) — reserve if still in stock
          const unit = await tx.deviceUnit.findUnique({ where: { imei: item.imei } });
          if (unit?.status === 'in_stock') await reserveUnit(item.imei, item.sku);
          continue;
        }
        const product = await tx.product.findUnique({ where: { sku: item.sku } });
        if (!product) continue; // non-serialized line (accessory) — nothing to assign

        const units = await tx.deviceUnit.findMany({
          where: { productId: product.id, status: 'in_stock' },
          take: item.qty,
          orderBy: { id: 'asc' },
        });
        if (units.length < item.qty) {
          throw new ConflictError(
            'insufficient_stock',
            `Недостаточно единиц ${item.sku}: нужно ${item.qty}, в наличии ${units.length}`,
          );
        }

        // first unit stays on this line (qty→1); extra units become their own lines
        await tx.orderItem.update({
          where: { id: item.id },
          data: { qty: 1, imei: units[0].imei },
        });
        await reserveUnit(units[0].imei, item.sku);
        for (const unit of units.slice(1)) {
          await tx.orderItem.create({
            data: { orderId, sku: item.sku, qty: 1, price: item.price, imei: unit.imei },
          });
          await reserveUnit(unit.imei, item.sku);
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'reserved' },
      });
      events.push({
        type: EventType.OrderReserved,
        actor,
        payload: { orderId, assigned: assigned.length },
        refs: [orderId],
      });
      return { result: { order: updated, assigned }, events };
    });
  }
}
