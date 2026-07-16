import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { releaseQuantityConsignmentOnTx } from '../inventory/consignment-accounting';
import { ConflictError } from '../common/errors';

const EXPIRABLE_ORDER_STATUSES = ['created', 'awaiting_confirmation', 'confirmed', 'reserved', 'awaiting_payment'] as const;

/**
 * Reservation lifecycle — enforces Business Invariant #7:
 *   «Нельзя оставить резерв без срока жизни. Каждый reservation имеет expiresAt;
 *    истёкшие освобождаются.»
 *
 * `OrdersService.reserve()` already sets `expiresAt` on every hold; this service
 * closes the loop by actually releasing the expired ones. Nothing else in the
 * system does — without this sweep a stranded hold would keep an in-stock unit
 * locked forever.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly units: UnitsService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Release every active reservation whose `expiresAt` has passed. Each release
   * runs in its own audited transaction (invariant #10): the held unit returns to
   * `in_stock` and a compensating `stock.released` + `reservation.expired` pair is
   * appended to the Event Ledger — corrections are expressed as events, never as
   * silent edits.
   *
   * Idempotent by design: the reservation is re-read inside the transaction, so an
   * overlapping sweep (or a manual re-run) that lost the race simply skips it and
   * releases nothing more. `now` is injectable to keep the logic unit-testable.
   */
  async releaseExpired(now: Date = new Date()): Promise<{ released: number }> {
    const expired = await this.prisma.reservation.findMany({
      where: { active: true, expiresAt: { lte: now } },
    });

    let released = 0;
    for (const orderId of [...new Set(expired.map((reservation) => reservation.orderId))].sort()) {
      const releasedForOrder = await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        const lockedOrder = await tx.order.findUnique({
          where: { id: orderId },
          select: { status: true },
        });
        const activeReservations = await tx.reservation.findMany({
          where: { orderId, active: true },
          include: { quantityAllocation: true },
          orderBy: { id: 'asc' },
        });
        if (
          !lockedOrder
          || !(EXPIRABLE_ORDER_STATUSES as readonly string[]).includes(lockedOrder.status)
          || !activeReservations.some((reservation) => reservation.expiresAt <= now)
        ) {
          return { result: 0, events: [] };
        }
        activeReservations.sort((left, right) => {
          const leftKey = left.quantityAllocation?.balanceId ?? left.imei ?? left.id;
          const rightKey = right.quantityAllocation?.balanceId ?? right.imei ?? right.id;
          return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
        });
        const balanceIds = [...new Set(activeReservations.flatMap((reservation) => (
          reservation.quantityAllocation?.balanceId ? [reservation.quantityAllocation.balanceId] : []
        )))].sort();
        if (balanceIds.length > 0) {
          await tx.$queryRaw(Prisma.sql`
            SELECT id
            FROM "InventoryBalance"
            WHERE id IN (${Prisma.join(balanceIds)})
            ORDER BY id
            FOR UPDATE
          `);
        }
        const events: AuditInput[] = [];
        const order = await tx.order.findUnique({ where: { id: orderId } });
        for (const fresh of activeReservations) {
          await tx.reservation.update({ where: { id: fresh.id }, data: { active: false } });
          if (fresh.imei) {
            const freed = await this.units.releaseOnTx(tx, fresh.imei, fresh.orderId);
            if (freed) {
              events.push({
                type: EventType.StockReleased,
                actor: 'system',
                payload: { orderId: fresh.orderId, imei: fresh.imei, reason: 'reservation_expired' },
                refs: [fresh.orderId, fresh.imei],
              });
            }
          }
          if (fresh.quantityAllocationId) {
            const allocation = fresh.quantityAllocation;
            if (allocation?.active) {
              const releasedBalance = await tx.inventoryBalance.updateMany({
                where: { id: allocation.balanceId, reserved: { gte: allocation.qty } },
                data: { reserved: { decrement: allocation.qty } },
              });
              if (releasedBalance.count !== 1) {
                throw new ConflictError('quantity_reservation_release_failed', `Резерв ${allocation.id} нельзя освободить атомарно`);
              }
              await releaseQuantityConsignmentOnTx(tx, allocation.id);
              await tx.orderQuantityAllocation.update({ where: { id: allocation.id }, data: { active: false } });
              events.push({
                type: EventType.StockReleased,
                actor: 'system',
                payload: { orderId: fresh.orderId, sku: allocation.sku, qty: allocation.qty, reason: 'reservation_expired' },
                refs: [fresh.orderId, allocation.productId, allocation.id],
              });
            }
          }
          events.push({
            type: EventType.ReservationExpired,
            actor: 'system',
            payload: { reservationId: fresh.id, orderId: fresh.orderId, expiresAt: fresh.expiresAt.toISOString() },
            refs: fresh.imei
              ? [fresh.orderId, fresh.imei]
              : fresh.quantityAllocationId
                ? [fresh.orderId, fresh.quantityAllocationId]
                : [fresh.orderId],
          });
          if (order) {
            await enqueueConsentedCustomerNotice(tx, this.outbox, {
              customerId: order.customerId,
              template: 'reservation_expired',
              payload: { orderId: fresh.orderId, imei: fresh.imei ?? null },
            });
          }
        }
        await tx.orderBundleAllocation.updateMany({
          where: { orderId, active: true },
          data: { active: false, releasedAt: now },
        });
        if (lockedOrder.status === 'reserved' || lockedOrder.status === 'awaiting_payment') {
          await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
          events.push({
            type: 'order.confirmed',
            actor: 'system',
            payload: { orderId, from: lockedOrder.status, to: 'confirmed', reason: 'reservation_expired' },
            refs: [orderId],
          });
        }
        return { result: activeReservations.length, events };
      });
      released += releasedForOrder;
    }

    return { released };
  }
}
