import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueStaffNotice } from '../outbox/customer-notifications';
import { CloseShiftDto, HandoverShiftDto, OpenShiftDto } from './shifts.dto';

/**
 * Cash shift lifecycle with drawer reconciliation.
 *
 * Invariant #3: «Нельзя закрыть кассу без фактической сверки». Closing requires the
 * counted cash. A self-close is a one-shot blind count: when it diverges from the
 * expected drawer amount, the server records a system workflow marker and a
 * cash.shortage event. A manager closing somebody else's drawer must supply a reason.
 *
 * Expected drawer cash = openCash + Σ(cash payments on this shift). Refunds are
 * stored as negative amounts, so they subtract naturally.
 */
/**
 * Причина, которую подставляет система при слепом пересчёте.
 *
 * Слепой пересчёт сам по себе верен: кассир не видит ожидаемую сумму, поэтому
 * объяснить расхождение, о котором он не знает, физически не может — требовать
 * от него текст значило бы получать бессмысленные отписки.
 *
 * Дефект был не в подстановке, а в том, что она невидима: `reasonSource:
 * 'system'` писался в леджер и не читался нигде, а Risk Center показывал эту
 * строку наравне с настоящим объяснением. Экспортирована, чтобы отчёт отличал
 * «объяснено человеком» от «объяснения нет» по константе, а не по литералу.
 */
export const BLIND_COUNT_REASON = 'Слепой пересчёт кассы';

@Injectable()
export class ShiftsService {
  static readonly BLIND_COUNT_REASON = BLIND_COUNT_REASON;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
  ) {}

  async getForStaff(id: string, staffId: string, role: string | undefined) {
    const manager = role === Role.owner || role === Role.admin;
    const shift = await this.prisma.cashShift.findUnique({
      where: { id },
    });
    if (!shift) return null;
    if (shift.staffId === staffId) return shift;
    if (!manager) return null;
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

  async openShifts(
    point: string | undefined,
    staffId: string,
    role: string | undefined,
    staffPoint?: string,
  ) {
    const manager = role === Role.owner || role === Role.admin;
    const staff = await this.prisma.staffUser.findMany({
      where: {
        active: true,
        ...(!manager && staffPoint ? { point: staffPoint } : {}),
        role: {
          in: manager
            ? ['cashier', 'seller', 'senior_seller', 'franchise', 'admin', 'owner']
            : ['cashier', 'seller', 'senior_seller'],
        },
      },
      select: { id: true, username: true, role: true },
      orderBy: { username: 'asc' },
    });
    const names = new Map(staff.map((person) => [person.id, person]));
    const where = {
      closedAt: null,
      ...(point?.trim() ? { point: point.trim() } : {}),
    };
    if (!manager) {
      const shifts = await this.prisma.cashShift.findMany({
        where: { ...where, staffId },
        orderBy: { openedAt: 'asc' },
      });
      return {
        shifts: shifts.map((shift) => ({ ...shift, staff: names.get(shift.staffId) ?? null })),
        staff,
      };
    }
    const shifts = await this.prisma.cashShift.findMany({
      where,
      include: { payments: { where: { method: 'cash' }, select: { amount: true } } },
      orderBy: { openedAt: 'asc' },
    });
    return {
      shifts: shifts.map((shift) => ({
        ...shift,
        ...(shift.staffId === staffId
          ? {}
          : { expectedCash: shift.openCash + shift.payments.reduce((sum, payment) => sum + payment.amount, 0) }),
        staff: names.get(shift.staffId) ?? null,
        payments: undefined,
      })),
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
      if (this.outbox) {
        await enqueueStaffNotice(tx, this.outbox, {
          template: 'shift_opened',
          title: 'Смена открыта',
          body: `${dto.point} · размен ${dto.openCash} сом`,
          payload: { shiftId: shift.id, staffId: dto.staffId, point: dto.point, openCash: dto.openCash, deepLink: `alistore-admin://shifts/${shift.id}` },
        });
      }
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

  private async assertNoPendingCashRefunds(tx: Prisma.TransactionClient, shiftId: string) {
    const pending = await tx.refundAllocation.count({
      where: {
        shiftId,
        status: { in: ['queued', 'processing', 'provider_pending', 'failed'] },
        refund: { status: { in: ['requested', 'approved', 'processing', 'partially_succeeded', 'failed'] } },
      },
    });
    if (pending > 0) {
      throw new ConflictError(
        'shift_has_pending_refunds',
        'Смену нельзя закрыть или передать, пока наличный возврат не исполнен или не отклонён',
      );
    }
  }

  /**
   * Owner-or-manager guard shared by close() and handover(): only the shift owner
   * or an owner/admin role may run the mutation (LOGIC-005).
   */
  private assertOwnerOrManager(shiftStaffId: string, actor: string, actorRole: string | undefined) {
    const manager = actorRole === Role.owner || actorRole === Role.admin;
    if (shiftStaffId !== actor && !manager) {
      throw new NotFoundException('Смена не найдена');
    }
  }

  private closeReason(
    shiftStaffId: string,
    actor: string,
    actorRole: string | undefined,
    diff: number,
    requestedReason: string | undefined,
  ) {
    const reason = requestedReason?.trim() || null;
    if (diff === 0 || reason) return reason;
    const selfBlindCount = shiftStaffId === actor && actorRole !== undefined;
    return selfBlindCount ? ShiftsService.BLIND_COUNT_REASON : null;
  }

  /**
   * Close a shift with reconciliation. diff = closeCash − expected. The owner of the
   * drawer submits one blind count; a manager closing another drawer must explain a
   * non-zero difference. Every discrepancy appends cash.shortage.
   */
  async close(shiftId: string, dto: CloseShiftDto, actor: string, idempotencyKey?: string, actorRole?: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-close:' + shiftId}))::text AS locked`;
      await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
      const shift = await tx.cashShift.findUnique({ where: { id: shiftId } });
      if (!shift) {
        throw new NotFoundException('Смена не найдена');
      }
      // The controller always passes the staff role; legacy service-level callers
      // without role context keep the previous owner-blind behavior.
      if (actorRole !== undefined) {
        this.assertOwnerOrManager(shift.staffId, actor, actorRole);
      }
      if (shift.closedAt) {
        if (idempotencyKey && shift.closeIdempotencyKey === idempotencyKey) {
          const replayReason = this.closeReason(
            shift.staffId,
            actor,
            actorRole,
            shift.diff ?? 0,
            dto.reason,
          );
          if (
            shift.closeCash !== dto.closeCash ||
            (shift.closeReason ?? null) !== replayReason
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

      await this.assertNoPendingCashRefunds(tx, shiftId);
      const expected = await this.expectedCash(tx, shiftId, shift.openCash);
      const diff = dto.closeCash - expected;
      const reason = this.closeReason(shift.staffId, actor, actorRole, diff, dto.reason);
      const userNote = dto.reason?.trim() || null;

      // Invariant #3: a discrepancy must be explained.
      if (diff !== 0 && !reason) {
        throw new ValidationError(
          'reconciliation_reason_required',
          'Расхождение кассы требует причину',
        );
      }

      const events: AuditInput[] = [];
      const closed = await tx.cashShift.update({
        where: { id: shiftId },
        data: {
          closeCash: dto.closeCash,
          closeReason: reason,
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
          reason,
          reconciliationMode: shift.staffId === actor ? 'blind' : 'manager',
          reasonSource: userNote ? 'user' : 'system',
          userNote,
        },
        refs: [shiftId],
      });
      if (diff !== 0) {
        events.push({
          type: EventType.CashShortage,
          actor,
          payload: {
            shiftId,
            diff,
            reason,
            reconciliationMode: shift.staffId === actor ? 'blind' : 'manager',
            reasonSource: userNote ? 'user' : 'system',
            userNote,
          },
          refs: [shiftId],
        });
      }
      if (this.outbox) {
        await enqueueStaffNotice(tx, this.outbox, {
          template: 'shift_closed',
          title: 'Смена закрыта',
          body: diff === 0 ? `Касса сошлась: ${dto.closeCash} сом` : `Расхождение кассы ${diff} сом`,
          payload: { shiftId, expected, closeCash: dto.closeCash, diff, deepLink: `alistore-admin://shifts/${shiftId}` },
        });
        if (diff !== 0) {
          await enqueueStaffNotice(tx, this.outbox, {
            template: 'cash_shortage',
            title: 'Недостача кассы',
            body: `${diff} сом · ${reason}`,
            payload: { shiftId, diff, deepLink: `alistore-admin://shifts/${shiftId}` },
          });
        }
      }
      return { result: { ...closed, expected }, events };
    });
  }

  async handover(shiftId: string, dto: HandoverShiftDto, actor: string, actorRole: string | undefined, rawKey?: string) {
    const key = rawKey?.trim();
    if (!key || key.length > 100) throw new ValidationError('idempotency_key_required', 'Требуется Idempotency-Key до 100 символов');
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-handover-key:' + key}))::text AS locked`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-handover:' + shiftId}))::text AS locked`;
      await tx.$queryRaw`SELECT id FROM "CashShift" WHERE id = ${shiftId} FOR UPDATE`;
      const source = await tx.cashShift.findUnique({ where: { id: shiftId } });
      if (!source) throw new NotFoundException('Смена не найдена');
      this.assertOwnerOrManager(source.staffId, actor, actorRole);

      const replay = await tx.cashShiftHandover.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        const replayReason = this.closeReason(
          source.staffId,
          actor,
          actorRole,
          replay.diff,
          dto.reason,
        );
        if (replay.fromShiftId !== shiftId || replay.toStaffId !== dto.toStaffId || replay.countedCash !== dto.countedCash || replay.reason !== replayReason) throw new ConflictError('shift_idempotency_mismatch', 'Ключ передачи уже использован для другой команды');
        const targetShift = await tx.cashShift.findUniqueOrThrow({ where: { id: replay.toShiftId } });
        return { result: { handover: replay, targetShift }, events: [] };
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'shift-open:' + dto.toStaffId}))::text AS locked`;
      if (source.closedAt) throw new ConflictError('shift_already_closed', 'Закрытую смену нельзя передать');
      await this.assertNoPendingCashRefunds(tx, source.id);
      if (source.staffId === dto.toStaffId) throw new ValidationError('shift_handover_same_staff', 'Получатель должен отличаться от передающего');
      const target = await tx.staffUser.findUnique({ where: { id: dto.toStaffId } });
      if (!target?.active || !['cashier', 'seller', 'senior_seller', 'franchise', 'admin', 'owner'].includes(target.role)) throw new ValidationError('shift_handover_target_invalid', 'Получатель неактивен или не может работать с кассой');
      if (target.point !== source.point) {
        throw new ValidationError('shift_handover_point_mismatch', 'Получатель должен работать в той же точке');
      }
      const targetOpen = await tx.cashShift.findFirst({ where: { staffId: dto.toStaffId, closedAt: null } });
      if (targetOpen) throw new ConflictError('shift_already_open', 'У получателя уже есть открытая кассовая смена');
      const expected = await this.expectedCash(tx, source.id, source.openCash);
      const diff = dto.countedCash - expected;
      const reason = this.closeReason(source.staffId, actor, actorRole, diff, dto.reason);
      const userNote = dto.reason?.trim() || null;
      if (diff !== 0 && !reason) throw new ValidationError('reconciliation_reason_required', 'Расхождение кассы требует причину');
      const closedAt = new Date();
      await tx.cashShift.update({ where: { id: source.id }, data: { closeCash: dto.countedCash, closeReason: reason, closeIdempotencyKey: `handover:${key}:close`, diff, closedAt } });
      const targetShift = await tx.cashShift.create({ data: { staffId: dto.toStaffId, point: source.point, openCash: dto.countedCash, openIdempotencyKey: `handover:${key}:open` } });
      const handover = await tx.cashShiftHandover.create({ data: { idempotencyKey: key, fromShiftId: source.id, toShiftId: targetShift.id, fromStaffId: source.staffId, toStaffId: dto.toStaffId, point: source.point, expectedCash: expected, countedCash: dto.countedCash, diff, reason, createdBy: actor } });
      const events: AuditInput[] = [
        { type: EventType.ShiftClosed, actor, payload: { shiftId: source.id, expected, closeCash: dto.countedCash, diff, reason, reconciliationMode: source.staffId === actor ? 'blind' : 'manager', reasonSource: userNote ? 'user' : 'system', userNote, handoverId: handover.id }, refs: [source.id, handover.id] },
        { type: EventType.CashHandover, actor, payload: { handoverId: handover.id, fromShiftId: source.id, toShiftId: targetShift.id, fromStaffId: source.staffId, toStaffId: dto.toStaffId, amount: dto.countedCash, diff }, refs: [handover.id, source.id, targetShift.id] },
        { type: EventType.ShiftOpened, actor, payload: { shiftId: targetShift.id, staffId: dto.toStaffId, point: source.point, openCash: dto.countedCash, handoverId: handover.id }, refs: [targetShift.id, handover.id] },
      ];
      if (diff !== 0) events.splice(1, 0, { type: EventType.CashShortage, actor, payload: { shiftId: source.id, diff, reason, reconciliationMode: source.staffId === actor ? 'blind' : 'manager', reasonSource: userNote ? 'user' : 'system', userNote, handoverId: handover.id }, refs: [source.id, handover.id] });
      return { result: { handover, targetShift }, events };
    });
  }
}
