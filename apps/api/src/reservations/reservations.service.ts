import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { UnitsService } from '../units/units.service';

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
    for (const reservation of expired) {
      const didRelease = await this.audit.transaction(async (tx) => {
        // Re-check under the transaction — a parallel sweep may have won the race.
        const fresh = await tx.reservation.findUnique({
          where: { id: reservation.id },
        });
        if (!fresh || !fresh.active) {
          return { result: false, events: [] };
        }

        await tx.reservation.update({
          where: { id: fresh.id },
          data: { active: false },
        });

        const events: AuditInput[] = [];
        if (fresh.imei) {
          const freed = await this.units.releaseOnTx(tx, fresh.imei, fresh.orderId);
          if (freed) {
            events.push({
              type: EventType.StockReleased,
              actor: 'system',
              payload: {
                orderId: fresh.orderId,
                imei: fresh.imei,
                reason: 'reservation_expired',
              },
              refs: [fresh.orderId, fresh.imei],
            });
          }
        }
        events.push({
          type: EventType.ReservationExpired,
          actor: 'system',
          payload: {
            reservationId: fresh.id,
            orderId: fresh.orderId,
            expiresAt: fresh.expiresAt.toISOString(),
          },
          refs: fresh.imei ? [fresh.orderId, fresh.imei] : [fresh.orderId],
        });

        return { result: true, events };
      });
      if (didRelease) released += 1;
    }

    return { released };
  }
}
