import { getJson, patchAuthJson, postAuthJson } from './http';

export type HrStaff = { id: string; username: string; role: string; active: boolean };
export type HrAttendance = { id: string; checkedInAt: string; checkedOutAt: string | null };
export type HrSchedule = {
  id: string; staffId: string; point: string; shiftDate: string; startsAt: string; endsAt: string;
  cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null;
  attendance: HrAttendance | null;
};
export type HrAbsence = {
  id: string; staffId: string; type: string; startsOn: string; endsOn: string; reason: string | null;
  status: 'requested' | 'approved' | 'rejected' | 'cancelled'; decisionNote: string | null;
};
export type HrTimesheetRow = { staffId: string; username: string; shifts: number; minutes: number; lateMinutes: number; overtimeMinutes: number };
export type HrWeek = {
  weekStart: string; weekEnd: string; point: string | null; staff: HrStaff[]; schedules: HrSchedule[];
  absences: HrAbsence[]; timesheet: HrTimesheetRow[];
};

export function fetchHrWeek(weekStart: string, point: string, token: string) {
  const query = new URLSearchParams({ weekStart });
  if (point.trim()) query.set('point', point.trim());
  return getJson<HrWeek>(`/hr/week?${query}`, token);
}

export function createHrSchedule(input: { staffId: string; point: string; shiftDate: string; startsAt: string; endsAt: string }, token: string) {
  return postAuthJson<HrSchedule>('/hr/schedules', input, token, { 'idempotency-key': crypto.randomUUID() });
}

export function updateHrSchedule(id: string, input: { point: string; shiftDate: string; startsAt: string; endsAt: string }, token: string) {
  return patchAuthJson<HrSchedule>(`/hr/schedules/${encodeURIComponent(id)}`, input, token, { 'idempotency-key': crypto.randomUUID() });
}

export function cancelHrSchedule(id: string, reason: string, token: string) {
  return postAuthJson<HrSchedule>(`/hr/schedules/${encodeURIComponent(id)}/cancel`, { reason }, token, { 'idempotency-key': crypto.randomUUID() });
}

export function decideHrAbsence(id: string, status: 'approved' | 'rejected', token: string) {
  return postAuthJson<HrAbsence>(`/hr/absences/${encodeURIComponent(id)}/decide`, { status }, token);
}
