import { Injectable } from '@nestjs/common';
import { HrAbsenceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHrScheduleDto, RequestHrAbsenceDto } from './hr.dto';

const DAY_MS = 86_400_000;

function dateOnly(value: string, field: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ValidationError('hr_invalid_date', `${field}: неверная дата`);
  return date;
}

function weekBounds(weekStart: string) {
  const start = dateOnly(weekStart, 'weekStart');
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

function requireKey(key?: string) {
  if (!key?.trim()) throw new ValidationError('idempotency_key_required', 'Требуется Idempotency-Key');
  return key.trim();
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const shiftDate = dateOnly(dto.shiftDate, 'shiftDate');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt || startsAt.toISOString().slice(0, 10) !== dto.shiftDate.slice(0, 10) || endsAt.toISOString().slice(0, 10) !== dto.shiftDate.slice(0, 10)) {
      throw new ValidationError('hr_invalid_schedule_window', 'Смена должна начинаться и заканчиваться в выбранную дату');
    }
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
