import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { CloseShiftDto, HandoverShiftDto, OpenShiftDto } from './shifts.dto';

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

  async openShifts(point?: string) {
    const [shifts, staff] = await Promise.all([
      this.prisma.cashShift.findMany({ where: { closedAt: null, ...(point?.trim() ? { point: point.trim() } : {}) }, include: { payments: { where: { method: 'cash' }, select: { amount: true } } }, orderBy: { openedAt: 'asc' } }),
      this.prisma.staffUser.findMany({ where: { active: true, role: { in: ['cashier', 'seller', 'senior_seller', 'franchise', 'admin', 'owner'] } }, select: { id: true, username: true, role: true }, orderBy: { username: 'asc' } }),
    ]);
    const names = new Map(staff.map((person) => [person.id, person]));
    return {
      shifts: shifts.map((shift) => ({ ...shift, expectedCash: shift.openCash + shift.payments.reduce((sum, payment) => sum + payment.amount, 0), staff: names.get(shift.staffId) ?? null, payments: undefined })),
      staff,
    };
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

  async handover(shiftId: string, dto: HandoverShiftDto, actor: string, actorRole: string | undefined, rawKey?: string) {
    const key = rawKey?.trim();
    if (!key || key.length > 100) throw new ValidationError('idempotency_key_required', 'Требуется Idempotency-Key до 100 символов');
    const reason = dto.reason?.trim() || null;
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-handover-key:' + key}))::text AS locked`;
      const replay = await tx.cashShiftHandover.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.fromShiftId !== shiftId || replay.toStaffId !== dto.toStaffId || replay.countedCash !== dto.countedCash || replay.reason !== reason) throw new ConflictError('shift_idempotency_mismatch', 'Ключ передачи уже использован для другой команды');
        const targetShift = await tx.cashShift.findUniqueOrThrow({ where: { id: replay.toShiftId } });
        return { result: { handover: replay, targetShift }, events: [] };
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-handover:' + shiftId}))::text AS locked`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-open:' + dto.toStaffId}))::text AS locked`;
      const source = await tx.cashShift.findUnique({ where: { id: shiftId } });
      if (!source) throw new ValidationError('shift_not_found', `Смена ${shiftId} не найдена`);
      if (source.closedAt) throw new ConflictError('shift_already_closed', 'Закрытую смену нельзя передать');
      const manager = actorRole === Role.owner || actorRole === Role.admin;
      if (source.staffId !== actor && !manager) throw new ConflictError('shift_handover_owner_mismatch', 'Можно передать только свою кассовую смену');
      if (source.staffId === dto.toStaffId) throw new ValidationError('shift_handover_same_staff', 'Получатель должен отличаться от передающего');
      const target = await tx.staffUser.findUnique({ where: { id: dto.toStaffId } });
      if (!target?.active || !['cashier', 'seller', 'senior_seller', 'franchise', 'admin', 'owner'].includes(target.role)) throw new ValidationError('shift_handover_target_invalid', 'Получатель неактивен или не может работать с кассой');
      const targetOpen = await tx.cashShift.findFirst({ where: { staffId: dto.toStaffId, closedAt: null } });
      if (targetOpen) throw new ConflictError('shift_already_open', 'У получателя уже есть открытая кассовая смена');
      const expected = await this.expectedCash(tx, source.id, source.openCash);
      const diff = dto.countedCash - expected;
      if (diff !== 0 && !reason) throw new ValidationError('reconciliation_reason_required', `Расхождение кассы ${diff} сом требует причину`);
      const closedAt = new Date();
      await tx.cashShift.update({ where: { id: source.id }, data: { closeCash: dto.countedCash, closeReason: reason, closeIdempotencyKey: `handover:${key}:close`, diff, closedAt } });
      const targetShift = await tx.cashShift.create({ data: { staffId: dto.toStaffId, point: source.point, openCash: dto.countedCash, openIdempotencyKey: `handover:${key}:open` } });
      const handover = await tx.cashShiftHandover.create({ data: { idempotencyKey: key, fromShiftId: source.id, toShiftId: targetShift.id, fromStaffId: source.staffId, toStaffId: dto.toStaffId, point: source.point, expectedCash: expected, countedCash: dto.countedCash, diff, reason, createdBy: actor } });
      const events: AuditInput[] = [
        { type: EventType.ShiftClosed, actor, payload: { shiftId: source.id, expected, closeCash: dto.countedCash, diff, reason, handoverId: handover.id }, refs: [source.id, handover.id] },
        { type: EventType.CashHandover, actor, payload: { handoverId: handover.id, fromShiftId: source.id, toShiftId: targetShift.id, fromStaffId: source.staffId, toStaffId: dto.toStaffId, amount: dto.countedCash, diff }, refs: [handover.id, source.id, targetShift.id] },
        { type: EventType.ShiftOpened, actor, payload: { shiftId: targetShift.id, staffId: dto.toStaffId, point: source.point, openCash: dto.countedCash, handoverId: handover.id }, refs: [targetShift.id, handover.id] },
      ];
      if (diff !== 0) events.splice(1, 0, { type: EventType.CashShortage, actor, payload: { shiftId: source.id, diff, reason, handoverId: handover.id }, refs: [source.id, handover.id] });
      return { result: { handover, targetShift }, events };
    });
  }
}
