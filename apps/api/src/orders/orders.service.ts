import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';
import { ValidationError } from '../common/errors';
import { assertTransition } from './order-state-machine';
import { CreateOrderDto } from './orders.dto';

/** Reservation lifetime — every reservation must have expiresAt (invariant #7). */
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 минут

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
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
}
