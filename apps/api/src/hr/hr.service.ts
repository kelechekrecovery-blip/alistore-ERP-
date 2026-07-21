import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { HrAbsenceStatus, Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { postAccountingEntryOnTx } from '../finance/accounting-journal';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHrScheduleDto, RequestHrAbsenceDto, UpdateHrScheduleDto } from './hr.dto';

const DAY_MS = 86_400_000;
/**
 * Payroll parameters. These were `as const` for every employee of the company,
 * so a salary review meant a code change and a deploy. They now come from the
 * Setting table, which falls back to exactly these numbers until the owner
 * changes one — behaviour is identical until somebody decides otherwise.
 */
// (значения по умолчанию живут в settings.registry.ts — здесь они больше не дублируются)

function dateOnly(value: string, field: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ValidationError('hr_invalid_date', `${field}: неверная дата`);
  return date;
}

function weekBounds(weekStart: string) {
  const start = dateOnly(weekStart, 'weekStart');
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

function payrollBounds(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ValidationError('hr_invalid_payroll_period', 'Период должен быть в формате YYYY-MM');
  const [year, month] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

function payrollPoint(point: string) {
  const value = point.trim();
  if (!value) throw new ValidationError('hr_payroll_point_required', 'Укажите точку начисления');
  return value;
}

function requireKey(key?: string) {
  if (!key?.trim()) throw new ValidationError('idempotency_key_required', 'Требуется Idempotency-Key');
  return key.trim();
}

function scheduleWindow(shiftDateValue: string, startsAtValue: string, endsAtValue: string) {
  const shiftDate = dateOnly(shiftDateValue, 'shiftDate');
  const startsAt = new Date(startsAtValue);
  const endsAt = new Date(endsAtValue);
  if (endsAt <= startsAt || startsAt.toISOString().slice(0, 10) !== shiftDateValue.slice(0, 10) || endsAt.toISOString().slice(0, 10) !== shiftDateValue.slice(0, 10)) {
    throw new ValidationError('hr_invalid_schedule_window', 'Смена должна начинаться и заканчиваться в выбранную дату');
  }
  return { shiftDate, startsAt, endsAt };
}

function jsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Effective payroll parameters — owner-set values, or the historical defaults. */
  private async payrollConfig() {
    const [baseAmount, commissionBps, latePenaltyPerMinute, overtimePayPerMinute] = await Promise.all([
      this.settings.value('payroll.base_amount_som'),
      this.settings.value('payroll.commission_bps'),
      this.settings.value('payroll.late_penalty_per_minute_som'),
      this.settings.value('payroll.overtime_per_minute_som'),
    ]);
    return { baseAmount, commissionBps, latePenaltyPerMinute, overtimePayPerMinute };
  }

  private async calculatePayroll(tx: Prisma.TransactionClient, period: string, rawPoint: string) {
    const PAYROLL_CONFIG = await this.payrollConfig();
    const point = payrollPoint(rawPoint);
    const { start, end } = payrollBounds(period);
    const [schedules, absences, payments] = await Promise.all([
      tx.hrSchedule.findMany({
        where: { point, shiftDate: { gte: start, lt: end }, cancelledAt: null },
        include: { attendance: true, staff: { select: { id: true, username: true } } },
        orderBy: [{ shiftDate: 'asc' }, { startsAt: 'asc' }],
      }),
      tx.hrAbsence.findMany({
        where: { status: 'approved', type: { in: ['annual_leave', 'sick_leave'] }, startsOn: { lt: end }, endsOn: { gte: start } },
      }),
      tx.payment.findMany({
        // Выборка шла через `shift: { point }`, а `shiftId` пишется только для
        // наличных (`payments.service.ts`: card/transfer/giftcard/bonus дают
        // null). Безналичная продажа не попадала в расчёт вовсе. У `Payment`
        // есть собственный `point` с индексом `[point, createdAt]`; `shift.point`
        // оставлен для исторических строк, где `point` не заполнялся.
        where: {
          amount: { gt: 0 },
          status: { in: ['received', 'reconciled'] },
          createdAt: { gte: start, lt: end },
          OR: [{ point }, { shift: { point } }],
        },
        select: { amount: true, receivedBy: true, shift: { select: { staffId: true } } },
      }),
    ]);
    // Выручка принадлежит тому, кто продал (`receivedBy`), а не владельцу
    // смены: наличные пробиваются в смене кассира, но закрывает сделку
    // продавец. Откат на владельца смены — для исторических платежей, у
    // которых `receivedBy` ещё не заполнялся.
    const soldBy = (payment: { receivedBy: string | null; shift: { staffId: string } | null }) =>
      payment.receivedBy ?? payment.shift?.staffId ?? null;
    const staffIds = new Set<string>(schedules.map((row) => row.staffId));
    payments.forEach((payment) => { const seller = soldBy(payment); if (seller) staffIds.add(seller); });
    const staff = await tx.staffUser.findMany({ where: { id: { in: [...staffIds] } }, select: { id: true, username: true } });
    const names = new Map(staff.map((person) => [person.id, person.username]));
    const lines = [...staffIds].map((staffId) => {
      const plans = schedules.filter((row) => row.staffId === staffId);
      const approved = absences.filter((absence) => absence.staffId === staffId);
      const completed = plans.filter((row) => row.attendance?.checkedOutAt);
      const paidAbsenceShifts = plans.filter((row) => approved.some((absence) => absence.startsOn <= row.shiftDate && absence.endsOn >= row.shiftDate)).length;
      const workedMinutes = completed.reduce((sum, row) => sum + Math.max(0, Math.round((row.attendance!.checkedOutAt!.getTime() - row.attendance!.checkedInAt.getTime()) / 60_000)), 0);
      const lateMinutes = completed.reduce((sum, row) => sum + Math.max(0, Math.round((row.attendance!.checkedInAt.getTime() - row.startsAt.getTime()) / 60_000)), 0);
      const overtimeMinutes = completed.reduce((sum, row) => sum + Math.max(0, Math.round((row.attendance!.checkedOutAt!.getTime() - row.endsAt.getTime()) / 60_000)), 0);
      const staffPayments = payments.filter((payment) => soldBy(payment) === staffId);
      const revenue = staffPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const coveredShifts = Math.min(plans.length, completed.length + paidAbsenceShifts);
      const baseEarned = plans.length ? Math.round(PAYROLL_CONFIG.baseAmount * coveredShifts / plans.length) : 0;
      const commission = Math.round(revenue * PAYROLL_CONFIG.commissionBps / 10_000);
      const lateDeduction = lateMinutes * PAYROLL_CONFIG.latePenaltyPerMinute;
      const overtimePay = overtimeMinutes * PAYROLL_CONFIG.overtimePayPerMinute;
      return {
        staffId, username: names.get(staffId) ?? staffId, plannedShifts: plans.length, completedShifts: completed.length, paidAbsenceShifts,
        workedMinutes, lateMinutes, overtimeMinutes, revenue, sales: staffPayments.length, baseEarned, commission, lateDeduction, overtimePay,
        total: Math.max(0, baseEarned + commission + overtimePay - lateDeduction),
      };
    }).sort((a, b) => a.username.localeCompare(b.username));
    const totals = lines.reduce((sum, line) => ({
      base: sum.base + line.baseEarned,
      commission: sum.commission + line.commission,
      adjustments: sum.adjustments + line.overtimePay - line.lateDeduction,
      payout: sum.payout + line.total,
    }), { base: 0, commission: 0, adjustments: 0, payout: 0 });
    return { period, point, config: PAYROLL_CONFIG, lines, totals };
  }

  payrollPreview(period: string, point: string) {
    return this.prisma.$transaction((tx) => this.calculatePayroll(tx, period, point));
  }

  payrollRuns(period: string, rawPoint: string) {
    const point = payrollPoint(rawPoint);
    payrollBounds(period);
    return this.prisma.hrPayrollRun.findMany({ where: { period, point }, include: { lines: { orderBy: { username: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  }

  async postPayroll(period: string, rawPoint: string, actor: string, rawKey?: string) {
    const key = requireKey(rawKey);
    const point = payrollPoint(rawPoint);
    payrollBounds(period);
    const request = { period, point };
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrPayrollCommand.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.action !== 'post' || stableJson(replay.request) !== stableJson(request)) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой операции начисления');
        return { result: replay.response, events: [] };
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'hr-payroll:' + period + ':' + point}))::text AS locked`;
      if (await tx.hrPayrollRun.findUnique({ where: { period_point: { period, point } } })) throw new ConflictError('hr_payroll_already_posted', 'Начисление за этот период уже проведено');
      const preview = await this.calculatePayroll(tx, period, point);
      if (!preview.lines.length) throw new ValidationError('hr_payroll_empty', 'Нет смен или продаж для начисления');
      if (!Number.isSafeInteger(preview.totals.payout) || preview.totals.payout <= 0) throw new ValidationError('hr_payroll_zero', 'Нельзя провести нулевое начисление');
      const runId = randomUUID();
      const accrual = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:hr-payroll:accrual:${runId}`,
        sourceType: 'hr.payroll.accrual',
        sourceRef: runId,
        description: `Начисление зарплаты ${period} · ${point}`,
        point,
        occurredAt: new Date(payrollBounds(period).end.getTime() - 1),
        createdBy: actor,
        lines: [
          { accountCode: '6100', debit: preview.totals.payout, memo: 'Расходы на зарплату по утверждённому payroll snapshot' },
          { accountCode: '2100', credit: preview.totals.payout, memo: 'Задолженность по зарплате' },
        ],
      });
      const run = await tx.hrPayrollRun.create({
        data: {
          id: runId,
          period, point, ...(await this.payrollConfig()), totalBase: preview.totals.base, totalCommission: preview.totals.commission,
          totalAdjustments: preview.totals.adjustments, totalPayout: preview.totals.payout, createdBy: actor, accrualAccountingEntryId: accrual.id,
          lines: { create: preview.lines },
        },
        include: { lines: { orderBy: { username: 'asc' } } },
      });
      const response = jsonValue(run);
      await tx.hrPayrollCommand.create({ data: { idempotencyKey: key, action: 'post', runId: run.id, request, response } });
      return { result: response, events: [
        { type: EventType.HrPayrollPosted, actor, payload: { runId: run.id, period, point, totalPayout: run.totalPayout, lineCount: run.lines.length, accountingEntryId: accrual.id }, refs: [run.id, ...run.lines.map((line) => line.staffId)] },
        { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: accrual.id, sourceType: 'hr.payroll.accrual', sourceRef: run.id, amount: run.totalPayout }, refs: [accrual.id, run.id, period] },
      ] };
    });
  }

  async payPayroll(runId: string, rawExternalRef: string, actor: string, rawKey?: string, rawFundingAccountCode?: string) {
    const key = requireKey(rawKey);
    const externalRef = rawExternalRef.trim();
    if (!externalRef) throw new ValidationError('hr_payroll_external_ref_required', 'Укажите номер платёжного документа');
    const fundingAccountCode = rawFundingAccountCode?.trim() || '1010';
    if (!['1000', '1010', '1020'].includes(fundingAccountCode)) throw new ValidationError('hr_payroll_funding_account_invalid', 'Недопустимый счёт выплаты зарплаты');
    const request = { runId, externalRef, fundingAccountCode };
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrPayrollCommand.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.action !== 'pay' || stableJson(replay.request) !== stableJson(request)) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой операции начисления');
        return { result: replay.response, events: [] };
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'hr-payroll-run:' + runId}))::text AS locked`;
      const current = await tx.hrPayrollRun.findUnique({ where: { id: runId } });
      if (!current) throw new ValidationError('hr_payroll_not_found', 'Начисление не найдено');
      if (current.status === 'paid') throw new ConflictError('hr_payroll_already_paid', 'Начисление уже выплачено');
      if (!current.accrualAccountingEntryId) throw new ConflictError('hr_payroll_accrual_missing', 'Для payroll отсутствует проводка начисления');
      const paidAt = new Date();
      const payout = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:hr-payroll:payout:${key}`,
        sourceType: 'hr.payroll.payout',
        sourceRef: runId,
        description: `Выплата зарплаты ${current.period} · ${current.point}`,
        point: current.point,
        documentAmount: current.totalPayout,
        baseAmount: current.totalPayout,
        occurredAt: paidAt,
        createdBy: actor,
        lines: [
          { accountCode: '2100', debit: current.totalPayout, memo: 'Погашение задолженности по зарплате' },
          { accountCode: fundingAccountCode, credit: current.totalPayout, memo: `Выплата по документу ${externalRef}` },
        ],
      });
      const paid = await tx.hrPayrollRun.update({ where: { id: runId }, data: { status: 'paid', paidBy: actor, paidAt, externalRef, payoutAccountingEntryId: payout.id }, include: { lines: { orderBy: { username: 'asc' } } } });
      const response = jsonValue(paid);
      await tx.hrPayrollCommand.create({ data: { idempotencyKey: key, action: 'pay', runId, request, response } });
      return { result: response, events: [
        { type: EventType.HrPayrollPaid, actor, payload: { runId, period: paid.period, point: paid.point, totalPayout: paid.totalPayout, externalRef, fundingAccountCode, accountingEntryId: payout.id }, refs: [runId, ...paid.lines.map((line) => line.staffId)] },
        { type: EventType.AccountingEntryPosted, actor, payload: { accountingEntryId: payout.id, sourceType: 'hr.payroll.payout', sourceRef: runId, amount: paid.totalPayout }, refs: [payout.id, runId, paid.period] },
      ] };
    });
  }

  async week(weekStart: string, point?: string, staffId?: string) {
    const { start, end } = weekBounds(weekStart);
    const staffWhere: Prisma.StaffUserWhereInput = { active: true, ...(staffId ? { id: staffId } : {}) };
    const scheduleWhere: Prisma.HrScheduleWhereInput = {
      shiftDate: { gte: start, lt: end },
      ...(point ? { point } : {}),
      ...(staffId ? { staffId } : {}),
    };
    const absenceWhere: Prisma.HrAbsenceWhereInput = {
      startsOn: { lt: end }, endsOn: { gte: start },
      ...(staffId ? { staffId } : {}),
    };
    const [staff, schedules, absences] = await Promise.all([
      this.prisma.staffUser.findMany({ where: staffWhere, select: { id: true, username: true, role: true, active: true }, orderBy: { username: 'asc' } }),
      this.prisma.hrSchedule.findMany({ where: scheduleWhere, include: { attendance: true }, orderBy: [{ shiftDate: 'asc' }, { startsAt: 'asc' }] }),
      this.prisma.hrAbsence.findMany({ where: absenceWhere, orderBy: { createdAt: 'desc' } }),
    ]);
    const timesheet = staff.map((person) => {
      const rows = schedules.filter((row) => row.staffId === person.id && row.attendance);
      return rows.reduce((total, row) => {
        const attendance = row.attendance!;
        const effectiveEnd = attendance.checkedOutAt ?? attendance.checkedInAt;
        total.shifts += attendance.checkedOutAt ? 1 : 0;
        total.minutes += attendance.checkedOutAt ? Math.max(0, Math.round((effectiveEnd.getTime() - attendance.checkedInAt.getTime()) / 60000)) : 0;
        total.lateMinutes += Math.max(0, Math.round((attendance.checkedInAt.getTime() - row.startsAt.getTime()) / 60000));
        total.overtimeMinutes += attendance.checkedOutAt ? Math.max(0, Math.round((attendance.checkedOutAt.getTime() - row.endsAt.getTime()) / 60000)) : 0;
        return total;
      }, { staffId: person.id, username: person.username, shifts: 0, minutes: 0, lateMinutes: 0, overtimeMinutes: 0 });
    });
    return { weekStart: start, weekEnd: new Date(end.getTime() - DAY_MS), point: point ?? null, staff, schedules, absences, timesheet };
  }

  async createSchedule(dto: CreateHrScheduleDto, actor: string, rawKey?: string) {
    const key = requireKey(rawKey);
    const { shiftDate, startsAt, endsAt } = scheduleWindow(dto.shiftDate, dto.startsAt, dto.endsAt);
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrSchedule.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.staffId !== dto.staffId || replay.startsAt.getTime() !== startsAt.getTime() || replay.endsAt.getTime() !== endsAt.getTime()) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой смены');
        return { result: replay, events: [] };
      }
      const staff = await tx.staffUser.findUnique({ where: { id: dto.staffId } });
      if (!staff?.active) throw new ValidationError('hr_staff_inactive', 'Сотрудник не найден или отключён');
      const absence = await tx.hrAbsence.findFirst({ where: { staffId: dto.staffId, status: 'approved', startsOn: { lte: shiftDate }, endsOn: { gte: shiftDate } } });
      if (absence) throw new ConflictError('hr_approved_absence', 'На эту дату утверждено отсутствие');
      const existing = await tx.hrSchedule.findUnique({ where: { staffId_shiftDate: { staffId: dto.staffId, shiftDate } } });
      if (existing) throw new ConflictError('hr_schedule_exists', 'На эту дату смена уже назначена');
      const schedule = await tx.hrSchedule.create({ data: { staffId: dto.staffId, point: dto.point.trim(), shiftDate, startsAt, endsAt, createdBy: actor, idempotencyKey: key } });
      return { result: schedule, events: [{ type: EventType.HrScheduleCreated, actor, payload: { scheduleId: schedule.id, staffId: schedule.staffId, point: schedule.point, startsAt, endsAt }, refs: [schedule.id, schedule.staffId] }] };
    });
  }

  async updateSchedule(id: string, dto: UpdateHrScheduleDto, actor: string, rawKey?: string) {
    const key = requireKey(rawKey);
    const window = scheduleWindow(dto.shiftDate, dto.startsAt, dto.endsAt);
    const request = { point: dto.point.trim(), shiftDate: dto.shiftDate.slice(0, 10), startsAt: window.startsAt.toISOString(), endsAt: window.endsAt.toISOString() };
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrScheduleCommand.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.scheduleId !== id || replay.action !== 'update' || stableJson(replay.request) !== stableJson(request)) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой команды графика');
        return { result: replay.response, events: [] };
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'hr-schedule:' + id}))::text AS locked`;
      const schedule = await tx.hrSchedule.findUnique({ where: { id }, include: { attendance: true } });
      if (!schedule) throw new ValidationError('hr_schedule_not_found', 'Плановая смена не найдена');
      if (schedule.attendance) throw new ConflictError('hr_schedule_started', 'Начатую смену нельзя менять');
      const absence = await tx.hrAbsence.findFirst({ where: { staffId: schedule.staffId, status: 'approved', startsOn: { lte: window.shiftDate }, endsOn: { gte: window.shiftDate } } });
      if (absence) throw new ConflictError('hr_approved_absence', 'На эту дату утверждено отсутствие');
      const conflict = await tx.hrSchedule.findFirst({ where: { staffId: schedule.staffId, shiftDate: window.shiftDate, id: { not: id } } });
      if (conflict) throw new ConflictError('hr_schedule_exists', 'На эту дату смена уже назначена');
      const updated = await tx.hrSchedule.update({ where: { id }, data: { point: request.point, shiftDate: window.shiftDate, startsAt: window.startsAt, endsAt: window.endsAt, cancelledAt: null, cancelledBy: null, cancelReason: null } });
      const response = jsonValue(updated);
      await tx.hrScheduleCommand.create({ data: { idempotencyKey: key, scheduleId: id, action: 'update', request, response } });
      return { result: response, events: [{ type: EventType.HrScheduleUpdated, actor, payload: { scheduleId: id, staffId: schedule.staffId, ...request }, refs: [id, schedule.staffId] }] };
    });
  }

  async cancelSchedule(id: string, reason: string | undefined, actor: string, rawKey?: string) {
    const key = requireKey(rawKey);
    const request = { reason: reason?.trim() || null };
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrScheduleCommand.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.scheduleId !== id || replay.action !== 'cancel' || stableJson(replay.request) !== stableJson(request)) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой команды графика');
        return { result: replay.response, events: [] };
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'hr-schedule:' + id}))::text AS locked`;
      const schedule = await tx.hrSchedule.findUnique({ where: { id }, include: { attendance: true } });
      if (!schedule) throw new ValidationError('hr_schedule_not_found', 'Плановая смена не найдена');
      if (schedule.attendance) throw new ConflictError('hr_schedule_started', 'Начатую смену нельзя отменить');
      if (schedule.cancelledAt) throw new ConflictError('hr_schedule_cancelled', 'Смена уже отменена');
      const updated = await tx.hrSchedule.update({ where: { id }, data: { cancelledAt: new Date(), cancelledBy: actor, cancelReason: request.reason } });
      const response = jsonValue(updated);
      await tx.hrScheduleCommand.create({ data: { idempotencyKey: key, scheduleId: id, action: 'cancel', request, response } });
      return { result: response, events: [{ type: EventType.HrScheduleCancelled, actor, payload: { scheduleId: id, staffId: schedule.staffId, reason: request.reason }, refs: [id, schedule.staffId] }] };
    });
  }

  async openAttendance(scheduleId: string, staffId: string, rawKey?: string) {
    const key = requireKey(rawKey);
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrAttendance.findUnique({ where: { checkInKey: key } });
      if (replay) {
        if (replay.scheduleId !== scheduleId || replay.staffId !== staffId) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой отметки');
        return { result: replay, events: [] };
      }
      const schedule = await tx.hrSchedule.findUnique({ where: { id: scheduleId }, include: { attendance: true } });
      if (!schedule) throw new ValidationError('hr_schedule_not_found', 'Плановая смена не найдена');
      if (schedule.staffId !== staffId) throw new ForbiddenError('hr_schedule_owner_mismatch', 'Нельзя открыть чужую смену');
      if (schedule.cancelledAt) throw new ConflictError('hr_schedule_cancelled', 'Отменённую смену нельзя открыть');
      if (schedule.attendance) throw new ConflictError('hr_attendance_open', 'Смена уже отмечена');
      const absence = await tx.hrAbsence.findFirst({ where: { staffId, status: 'approved', startsOn: { lte: schedule.shiftDate }, endsOn: { gte: schedule.shiftDate } } });
      if (absence) throw new ConflictError('hr_approved_absence', 'Нельзя открыть смену во время утверждённого отсутствия');
      const attendance = await tx.hrAttendance.create({ data: { scheduleId, staffId, point: schedule.point, checkedInAt: new Date(), checkInKey: key } });
      return { result: attendance, events: [{ type: EventType.HrAttendanceOpened, actor: staffId, payload: { attendanceId: attendance.id, scheduleId, point: schedule.point }, refs: [attendance.id, scheduleId, staffId] }] };
    });
  }

  async closeAttendance(scheduleId: string, staffId: string, rawKey?: string) {
    const key = requireKey(rawKey);
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrAttendance.findUnique({ where: { checkOutKey: key } });
      if (replay) {
        if (replay.scheduleId !== scheduleId || replay.staffId !== staffId) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другой отметки');
        return { result: replay, events: [] };
      }
      const attendance = await tx.hrAttendance.findUnique({ where: { scheduleId } });
      if (!attendance) throw new ValidationError('hr_attendance_not_open', 'Сначала отметьте начало смены');
      if (attendance.staffId !== staffId) throw new ForbiddenError('hr_schedule_owner_mismatch', 'Нельзя закрыть чужую смену');
      if (attendance.checkedOutAt) throw new ConflictError('hr_attendance_closed', 'Смена уже закрыта');
      const closed = await tx.hrAttendance.update({ where: { id: attendance.id }, data: { checkedOutAt: new Date(), checkOutKey: key } });
      return { result: closed, events: [{ type: EventType.HrAttendanceClosed, actor: staffId, payload: { attendanceId: closed.id, scheduleId }, refs: [closed.id, scheduleId, staffId] }] };
    });
  }

  async requestAbsence(dto: RequestHrAbsenceDto, staffId: string, rawKey?: string) {
    const key = requireKey(rawKey);
    const startsOn = dateOnly(dto.startsOn, 'startsOn');
    const endsOn = dateOnly(dto.endsOn, 'endsOn');
    if (endsOn < startsOn) throw new ValidationError('hr_invalid_absence_window', 'Дата окончания раньше даты начала');
    return this.audit.transaction(async (tx) => {
      const replay = await tx.hrAbsence.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.staffId !== staffId || replay.startsOn.getTime() !== startsOn.getTime() || replay.endsOn.getTime() !== endsOn.getTime()) throw new ConflictError('hr_idempotency_mismatch', 'Ключ уже использован для другого отсутствия');
        return { result: replay, events: [] };
      }
      const overlap = await tx.hrAbsence.findFirst({ where: { staffId, status: { in: ['requested', 'approved'] }, startsOn: { lte: endsOn }, endsOn: { gte: startsOn } } });
      if (overlap) throw new ConflictError('hr_absence_overlap', 'На этот период уже есть запрос отсутствия');
      const absence = await tx.hrAbsence.create({ data: { staffId, type: dto.type, startsOn, endsOn, reason: dto.reason?.trim() || null, createdBy: staffId, idempotencyKey: key } });
      return { result: absence, events: [{ type: EventType.HrAbsenceRequested, actor: staffId, payload: { absenceId: absence.id, type: absence.type, startsOn, endsOn }, refs: [absence.id, staffId] }] };
    });
  }

  async decideAbsence(id: string, status: HrAbsenceStatus, note: string | undefined, actor: string) {
    if (status !== 'approved' && status !== 'rejected') throw new ValidationError('hr_invalid_absence_decision', 'Допустимо только одобрить или отклонить');
    return this.audit.transaction(async (tx) => {
      const absence = await tx.hrAbsence.findUnique({ where: { id } });
      if (!absence) throw new ValidationError('hr_absence_not_found', 'Запрос отсутствия не найден');
      if (absence.status === status) return { result: absence, events: [] };
      if (absence.status !== 'requested') throw new ConflictError('hr_absence_decided', 'Решение уже принято');
      const updated = await tx.hrAbsence.update({ where: { id }, data: { status, decisionNote: note?.trim() || null, decidedBy: actor, decidedAt: new Date() } });
      return { result: updated, events: [{ type: status === 'approved' ? EventType.HrAbsenceApproved : EventType.HrAbsenceRejected, actor, payload: { absenceId: id, staffId: absence.staffId, note: note?.trim() || null }, refs: [id, absence.staffId] }] };
    });
  }
}
