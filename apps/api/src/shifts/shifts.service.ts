import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { CloseShiftDto, OpenShiftDto } from './shifts.dto';

/**
 * Cash shift lifecycle with drawer reconciliation.
 *
 * Invariant #3: «Нельзя закрыть кассу без фактической сверки». Closing requires the
 * counted cash; when it diverges from the expected drawer amount (diff ≠ 0) a reason
 * is mandatory and a cash.shortage event is written to the ledger. Approval + Risk
 * routing on discrepancies lands in v1 — the ledger record is the MVP guarantee.
 *
 * Expected drawer cash = openCash + Σ(cash payments on this shift). Refunds are
 * stored as negative amounts, so they subtract naturally.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get(id: string) {
    return this.prisma.cashShift.findUnique({
      where: { id },
      include: { payments: true },
    });
  }

  /** The staff member's currently open shift, if any (POS attaches sales to it). */
  currentOpen(staffId: string) {
    return this.prisma.cashShift.findFirst({
      where: { staffId, closedAt: null },
    });
  }

  /** Open a shift. A staff member can hold only one open shift at a time (409). */
  async open(dto: OpenShiftDto, actor: string, idempotencyKey?: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-open:' + dto.staffId}))::text AS locked`;
      if (idempotencyKey) {
        const replay = await tx.cashShift.findUnique({ where: { openIdempotencyKey: idempotencyKey } });
        if (replay) {
          if (replay.staffId !== dto.staffId || replay.point !== dto.point || replay.openCash !== dto.openCash) {
            throw new ConflictError('shift_idempotency_mismatch', 'Ключ открытия смены уже использован для другой команды');
          }
          return { result: replay, events: [] };
        }
      }
      const existing = await tx.cashShift.findFirst({ where: { staffId: dto.staffId, closedAt: null } });
      if (existing) {
        throw new ConflictError(
          'shift_already_open',
          `У сотрудника ${dto.staffId} уже открыта смена ${existing.id}`,
        );
      }
      const shift = await tx.cashShift.create({
        data: { staffId: dto.staffId, point: dto.point, openCash: dto.openCash, openIdempotencyKey: idempotencyKey },
      });
      return {
        result: shift,
        events: [
          {
            type: EventType.ShiftOpened,
            actor,
            payload: {
              shiftId: shift.id,
              staffId: dto.staffId,
              point: dto.point,
              openCash: dto.openCash,
            },
            refs: [shift.id],
          },
        ],
      };
    });
  }

  /** Compute expected drawer cash for an open shift (openCash + cash payments). */
  private async expectedCash(
    tx: Prisma.TransactionClient,
    shiftId: string,
    openCash: number,
  ): Promise<number> {
    const agg = await tx.payment.aggregate({
      _sum: { amount: true },
      where: { shiftId, method: 'cash' },
    });
    return openCash + (agg._sum.amount ?? 0);
  }

  /**
   * Close a shift with reconciliation. diff = closeCash − expected. A non-zero diff
   * without a reason is rejected (422); with a reason it is recorded and a
   * cash.shortage event is appended.
   */
  async close(shiftId: string, dto: CloseShiftDto, actor: string, idempotencyKey?: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-close:' + shiftId}))::text AS locked`;
      const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
      if (!shift) {
        throw new ValidationError('shift_not_found', `Смена ${shiftId} не найдена`);
      }
      if (shift.closedAt) {
        if (idempotencyKey && shift.closeIdempotencyKey === idempotencyKey) {
          if (
            shift.closeCash !== dto.closeCash ||
            (shift.closeReason ?? null) !== (dto.reason?.trim() || null)
          ) {
            throw new ConflictError(
              'shift_idempotency_mismatch',
              'Ключ закрытия смены уже использован для другой команды',
            );
          }
          return {
            result: { ...shift, expected: shift.closeCash - (shift.diff ?? 0) },
            events: [],
          };
        }
        throw new ConflictError('shift_already_closed', `Смена ${shiftId} уже закрыта`);
      }

      if (idempotencyKey) {
        const used = await tx.cashShift.findUnique({ where: { closeIdempotencyKey: idempotencyKey } });
        if (used && used.id !== shiftId) {
          throw new ConflictError('shift_idempotency_mismatch', 'Ключ закрытия смены уже использован');
        }
      }

      const expected = await this.expectedCash(tx, shiftId, shift.openCash);
      const diff = dto.closeCash - expected;

      // Invariant #3: a discrepancy must be explained.
      if (diff !== 0 && !dto.reason?.trim()) {
        throw new ValidationError(
          'reconciliation_reason_required',
          `Расхождение кассы ${diff} сом требует причину`,
        );
      }

      const events: AuditInput[] = [];
      const closed = await tx.cashShift.update({
        where: { id: shiftId },
        data: {
          closeCash: dto.closeCash,
          closeReason: dto.reason?.trim() || null,
          closeIdempotencyKey: idempotencyKey,
          diff,
          closedAt: new Date(),
        },
      });
      events.push({
        type: EventType.ShiftClosed,
        actor,
        payload: {
          shiftId,
          expected,
          closeCash: dto.closeCash,
          diff,
          reason: dto.reason ?? null,
        },
        refs: [shiftId],
      });
      if (diff !== 0) {
        events.push({
          type: EventType.CashShortage,
          actor,
          payload: { shiftId, diff, reason: dto.reason },
          refs: [shiftId],
        });
      }
      return { result: { ...closed, expected }, events };
    });
  }
}
