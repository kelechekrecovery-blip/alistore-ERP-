import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { CreateRunDto, FailDeliveryDto, HandoverDto } from './courier.dto';

/**
 * Courier COD handover.
 *
 * Invariant #4: «Нельзя завершить доставку с наличными, пока курьер не сдал деньги».
 * A CourierRun holds the COD the courier collected; the money is NOT closed until
 * handedOver = true. Handover reconciles the counted cash against codTotal — a
 * mismatch (diff ≠ 0) requires a reason and raises cash.shortage (Risk in v1).
 */
@Injectable()
export class CourierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getRun(id: string) {
    return this.prisma.courierRun.findUnique({ where: { id } });
  }

  /** Assign a courier run with the COD total it must hand over. */
  async createRun(dto: CreateRunDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const run = await tx.courierRun.create({
        data: { courierId: dto.courierId, codTotal: dto.codTotal },
      });
      return {
        result: run,
        events: [
          {
            type: EventType.DeliveryAssigned,
            actor,
            payload: { runId: run.id, courierId: dto.courierId, codTotal: dto.codTotal },
            refs: [run.id],
          },
        ],
      };
    });
  }

  /**
   * Courier hands over collected COD. diff = amount − codTotal. A non-zero diff
   * without a reason is rejected (422). A run already handed over cannot be
   * handed over again (409).
   */
  async handover(dto: HandoverDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const run = await tx.courierRun.findUnique({ where: { id: dto.runId } });
      if (!run) {
        throw new ValidationError('run_not_found', `Курьерский рейс ${dto.runId} не найден`);
      }
      if (run.handedOver) {
        throw new ConflictError(
          'cod_already_handed_over',
          `COD по рейсу ${dto.runId} уже сдан`,
        );
      }

      const diff = dto.amount - run.codTotal;
      if (diff !== 0 && !dto.reason?.trim()) {
        throw new ValidationError(
          'handover_reason_required',
          `Расхождение COD ${diff} сом требует причину`,
        );
      }

      const events: AuditInput[] = [];
      const settled = await tx.courierRun.update({
        where: { id: dto.runId },
        data: { handedOver: true },
      });
      events.push({
        type: EventType.CashHandover,
        actor,
        payload: {
          runId: dto.runId,
          codTotal: run.codTotal,
          amount: dto.amount,
          diff,
          reason: dto.reason ?? null,
        },
        refs: [dto.runId],
      });
      if (diff !== 0) {
        events.push({
          type: EventType.CashShortage,
          actor,
          payload: { runId: dto.runId, diff, reason: dto.reason },
          refs: [dto.runId],
        });
      }
      return { result: { ...settled, diff }, events };
    });
  }

  /**
   * Record a failed delivery with reason + evidence (delivery.failed). Recovery
   * (reschedule / cancel) is a separate flow, so the order status is left untouched
   * here — the ledger keeps the immutable trail.
   */
  async failDelivery(orderId: string, dto: FailDeliveryDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
      }
      return {
        result: { orderId, recorded: true },
        events: [
          {
            type: EventType.DeliveryFailed,
            actor,
            payload: { orderId, reason: dto.reason, evidence: dto.evidence ?? null },
            refs: [orderId],
          },
        ],
      };
    });
  }
}
