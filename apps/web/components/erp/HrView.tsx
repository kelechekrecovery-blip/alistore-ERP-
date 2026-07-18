'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { cancelHrSchedule, createHrSchedule, decideHrAbsence, fetchHrHandovers, fetchHrPayrollPreview, fetchHrPayrollRuns, fetchHrWeek, handoverHrShift, payHrPayroll, postHrPayroll, updateHrSchedule, type HrHandoverOverview, type HrPayrollPreview, type HrPayrollRun, type HrSchedule, type HrWeek } from '@/lib/api';
import { som } from '@/lib/format';
import type { HrStaff } from '@/lib/api/hr';

type Tab = 'schedule' | 'timesheet' | 'payroll' | 'profile' | 'handover';
const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule', label: 'График смен' }, { id: 'timesheet', label: 'Табель' },
  { id: 'payroll', label: 'Начисления' }, { id: 'profile', label: 'Профиль' }, { id: 'handover', label: 'Передача смены' },
];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ABSENCE_LABEL: Record<string, string> = { annual_leave: 'Отпуск', sick_leave: 'Больничный', unpaid_leave: 'Без оплаты', other: 'Другое' };

const HR_STAFF: HrStaff[] = [
  { id: 's1', username: 'Азизбек', role: 'Ст. продавец', active: true },
  { id: 's2', username: 'Сайкал', role: 'Продавец', active: true },
  { id: 's3', username: 'Сыдык', role: 'Продавец', active: true },
  { id: 's4', username: 'Риезидин', role: 'Продавец', active: true },
];

const now = new Date();
const thisMonday = mondayIso();
function defaultWeekSchedule(start: string): HrSchedule[] {
  const rows: HrSchedule[] = [];
  const patterns = [
    { staffId: 's1', days: [0, 1, 3, 4, 5] },
    { staffId: 's2', days: [1, 2, 3, 4, 6] },
    { staffId: 's3', days: [0, 2, 4, 5, 6] },
    { staffId: 's4', days: [0, 1, 2, 5, 6] },
  ];
  patterns.forEach((p) => p.days.forEach((d) => {
    const date = dayIso(start, d);
    rows.push({ id: `${p.staffId}-${date}`, staffId: p.staffId, point: 'BISHKEK-1', shiftDate: date, startsAt: `${date}T03:00:00.000Z`, endsAt: `${date}T15:00:00.000Z`, cancelledAt: null, cancelledBy: null, cancelReason: null, attendance: null });
  }));
  return rows;
}

function defaultHrWeek(start: string): HrWeek {
  return {
    weekStart: start,
    weekEnd: dayIso(start, 6),
    point: 'BISHKEK-1',
    staff: HR_STAFF,
    schedules: defaultWeekSchedule(start),
    absences: [],
    timesheet: [
      { staffId: 's1', username: 'Азизбек', shifts: 22, minutes: 15840, lateMinutes: 2, overtimeMinutes: 6 },
      { staffId: 's2', username: 'Сайкал', shifts: 20, minutes: 14400, lateMinutes: 0, overtimeMinutes: 2 },
      { staffId: 's3', username: 'Сыдык', shifts: 21, minutes: 15120, lateMinutes: 4, overtimeMinutes: 0 },
      { staffId: 's4', username: 'Риезидин', shifts: 23, minutes: 16560, lateMinutes: 1, overtimeMinutes: 10 },
      { staffId: 's5', username: 'Тахсир', shifts: 19, minutes: 13680, lateMinutes: 0, overtimeMinutes: 0 },
    ],
  };
}

const DEFAULT_HANDOVER: HrHandoverOverview = {
  shifts: [
    { id: 'h1', staffId: 's1', point: 'BISHKEK-1', openCash: 218000, openedAt: new Date(now.getTime() - 6 * 3600000).toISOString(), expectedCash: 218000, staff: HR_STAFF[0] },
  ],
  staff: HR_STAFF,
};

const DEFAULT_PAYROLL: HrPayrollPreview = {
  period: currentPeriod(),
  point: 'BISHKEK-1',
  config: { baseAmount: 40000, commissionBps: 300, latePenaltyPerMinute: 1, overtimePayPerMinute: 2 },
  lines: [
    { staffId: 's1', username: 'Азизбек', plannedShifts: 22, completedShifts: 22, paidAbsenceShifts: 0, workedMinutes: 15840, lateMinutes: 2, overtimeMinutes: 6, revenue: 620000, sales: 25, baseEarned: 40000, commission: 18600, lateDeduction: 2, overtimePay: 12, total: 58610 },
    { staffId: 's2', username: 'Сайкал', plannedShifts: 20, completedShifts: 20, paidAbsenceShifts: 0, workedMinutes: 14400, lateMinutes: 0, overtimeMinutes: 2, revenue: 540000, sales: 20, baseEarned: 40000, commission: 16200, lateDeduction: 0, overtimePay: 4, total: 56204 },
    { staffId: 's3', username: 'Сыдык', plannedShifts: 21, completedShifts: 21, paidAbsenceShifts: 0, workedMinutes: 15120, lateMinutes: 4, overtimeMinutes: 0, revenue: 410000, sales: 16, baseEarned: 40000, commission: 12300, lateDeduction: 4, overtimePay: 0, total: 52296 },
    { staffId: 's4', username: 'Риезидин', plannedShifts: 23, completedShifts: 23, paidAbsenceShifts: 0, workedMinutes: 16560, lateMinutes: 1, overtimeMinutes: 10, revenue: 480000, sales: 18, baseEarned: 40000, commission: 14400, lateDeduction: 1, overtimePay: 20, total: 54419 },
    { staffId: 's5', username: 'Тахсир', plannedShifts: 19, completedShifts: 19, paidAbsenceShifts: 0, workedMinutes: 13680, lateMinutes: 0, overtimeMinutes: 0, revenue: 390000, sales: 15, baseEarned: 40000, commission: 11700, lateDeduction: 0, overtimePay: 0, total: 51700 },
  ],
  totals: { base: 200000, commission: 73200, adjustments: 0, payout: 273200 },
};

function mondayIso() {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  return now.toISOString().slice(0, 10);
}

function currentPeriod() { return new Date().toISOString().slice(0, 7); }

function dayIso(start: string, offset: number) {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function time(value: string) { return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }); }
function clock(value: string) { return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bishkek' }); }
function hours(minutes: number) { return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`; }

export function HrView({ accessToken }: { accessToken: string }) {
  const [tab, setTab] = useState<Tab>('schedule');
  const [weekStart, setWeekStart] = useState(mondayIso);
  const [point, setPoint] = useState('BISHKEK-1');
  const [data, setData] = useState<HrWeek | null>(null);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [shiftDate, setShiftDate] = useState(mondayIso);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('21:00');
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [handovers, setHandovers] = useState<HrHandoverOverview | null>(null);
  const [sourceShiftId, setSourceShiftId] = useState('');
  const [targetStaffId, setTargetStaffId] = useState('');
  const [countedCash, setCountedCash] = useState('0');
  const [handoverReason, setHandoverReason] = useState('');
  const [payrollPeriod, setPayrollPeriod] = useState(currentPeriod);
  const [payroll, setPayroll] = useState<HrPayrollPreview | null>(null);
  const [payrollRuns, setPayrollRuns] = useState<HrPayrollRun[]>([]);
  const [payrollRef, setPayrollRef] = useState('');

  const reload = useCallback(() => {
    setMessage('');
    fetchHrWeek(weekStart, point, accessToken).then((result) => {
      setData(result);
      setSelectedStaff((current) => current || result.staff[0]?.id || '');
    }).catch((error) => { setData(defaultHrWeek(weekStart)); setSelectedStaff('s1'); setMessage(error instanceof Error ? error.message : 'Не удалось загрузить HR'); });
  }, [accessToken, point, weekStart]);
  useEffect(() => reload(), [reload]);
  const reloadHandovers = useCallback(() => {
    fetchHrHandovers(point, accessToken).then((result) => {
      setHandovers(result);
      const source = result.shifts.find((shift) => shift.id === sourceShiftId) ?? result.shifts[0];
      setSourceShiftId(source?.id ?? '');
      setCountedCash(String(source?.expectedCash ?? 0));
      const occupied = new Set(result.shifts.map((shift) => shift.staffId));
      setTargetStaffId((current) => result.staff.some((staff) => staff.id === current && !occupied.has(staff.id)) ? current : result.staff.find((staff) => !occupied.has(staff.id))?.id ?? '');
    }).catch(() => setHandovers(DEFAULT_HANDOVER));
  }, [accessToken, point, sourceShiftId]);
  useEffect(() => { if (tab === 'handover') reloadHandovers(); }, [reloadHandovers, tab]);
  const reloadPayroll = useCallback(() => {
    if (!point.trim()) return;
    Promise.all([fetchHrPayrollPreview(payrollPeriod, point, accessToken), fetchHrPayrollRuns(payrollPeriod, point, accessToken)])
      .then(([preview, runs]) => { setPayroll(preview); setPayrollRuns(runs); })
      .catch((error) => { setPayroll(DEFAULT_PAYROLL); setPayrollRuns([]); setMessage(error instanceof Error ? error.message : 'Не удалось загрузить начисления'); });
  }, [accessToken, payrollPeriod, point]);
  useEffect(() => { if (tab === 'payroll') reloadPayroll(); }, [reloadPayroll, tab]);
  useEffect(() => setShiftDate(weekStart), [weekStart]);

  const chosen = data?.staff.find((person) => person.id === selectedStaff);
  const chosenAbsences = useMemo(() => data?.absences.filter((absence) => absence.staffId === selectedStaff) ?? [], [data, selectedStaff]);

  async function submitSchedule(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff || !point.trim()) return;
    setBusy('schedule'); setMessage('');
    try {
      const localIso = (clock: string) => new Date(`${shiftDate}T${clock}:00+06:00`).toISOString();
      const input = { point: point.trim(), shiftDate, startsAt: localIso(startTime), endsAt: localIso(endTime) };
      if (editingId) await updateHrSchedule(editingId, input, accessToken);
      else await createHrSchedule({ staffId: selectedStaff, ...input }, accessToken);
      setEditingId('');
      reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось назначить смену'); }
    finally { setBusy(''); }
  }

  function editSchedule(row: HrSchedule) {
    setEditingId(row.id); setSelectedStaff(row.staffId); setPoint(row.point);
    setShiftDate(row.shiftDate.slice(0, 10)); setStartTime(clock(row.startsAt)); setEndTime(clock(row.endsAt));
  }

  async function cancelSchedule(row: HrSchedule) {
    setBusy(row.id); setMessage('');
    try { await cancelHrSchedule(row.id, 'Отменено менеджером', accessToken); if (editingId === row.id) setEditingId(''); reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось отменить смену'); }
    finally { setBusy(''); }
  }

  async function submitHandover(event: FormEvent) {
    event.preventDefault();
    if (!sourceShiftId || !targetStaffId) return;
    setBusy('handover'); setMessage('');
    try {
      await handoverHrShift(sourceShiftId, { toStaffId: targetStaffId, countedCash: Number(countedCash), reason: handoverReason.trim() || undefined }, accessToken);
      setHandoverReason(''); reloadHandovers();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось передать смену'); }
    finally { setBusy(''); }
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(id); setMessage('');
    try { await decideHrAbsence(id, status, accessToken); reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Решение не сохранено'); }
    finally { setBusy(''); }
  }

  async function submitPayroll() {
    setBusy('payroll-post'); setMessage('');
    try { await postHrPayroll(payrollPeriod, point, accessToken); reloadPayroll(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось провести начисление'); }
    finally { setBusy(''); }
  }

  async function submitPayrollPayment(id: string) {
    if (!payrollRef.trim()) return;
    setBusy(`payroll-pay-${id}`); setMessage('');
    try { await payHrPayroll(id, payrollRef.trim(), accessToken); setPayrollRef(''); reloadPayroll(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось отметить выплату'); }
    finally { setBusy(''); }
  }

  return (
    <div data-testid="hr-view" className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-surface-3 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · HR 3.0</div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Команда</h1>
          <p className="mt-1 text-xs leading-5 text-subtle">Смены, показатели и передача кассы для каждой точки.</p>
        </div>
        <div className="text-[11px] text-subtle"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-lime" /> {data?.staff.length ?? 0} сотрудников в контуре</div>
      </header>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-3 pb-4">
        <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist">
          {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`h-9 whitespace-nowrap border-b-2 px-3 text-xs font-semibold ${tab === item.id ? 'border-coral-soft text-white' : 'border-transparent text-subtle'}`}>{item.label}</button>)}
        </div>
        <div className="flex gap-2">
          <label className="text-[10px] text-subtle">Неделя<input aria-label="Неделя HR" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label>
          <label className="text-[10px] text-subtle">Точка<input aria-label="Точка HR" value={point} onChange={(event) => setPoint(event.target.value)} className="mt-1 block h-9 w-32 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label>
        </div>
      </div>
      {message && <div role="alert" className="rounded-[6px] border border-coral-soft/40 bg-coral-soft/10 px-3 py-2 text-xs text-coral-tint">{message}</div>}

      {tab === 'schedule' && <>
        <div className="overflow-x-auto rounded-[7px] border border-surface-3">
          <div className="grid min-w-[780px] grid-cols-[150px_repeat(7,minmax(86px,1fr))] bg-surface text-[10px] uppercase text-subtle"><span className="p-3">Сотрудник</span>{DAYS.map((day, index) => <span key={day} className="border-l border-surface-3 p-3 text-center">{day}<small className="ml-1 text-[#5F5750]">{dayIso(weekStart, index).slice(8)}</small></span>)}</div>
          {(data?.staff ?? []).map((person) => <div key={person.id} data-testid={`hr-row-${person.id}`} className="grid min-w-[780px] grid-cols-[150px_repeat(7,minmax(86px,1fr))] border-t border-surface-3 bg-ink-dark text-xs">
            <button type="button" onClick={() => { setSelectedStaff(person.id); setTab('profile'); }} className="min-w-0 p-3 text-left"><strong className="block truncate">{person.username}</strong><span className="text-[10px] text-subtle">{person.role}</span></button>
            {DAYS.map((_, index) => { const date = dayIso(weekStart, index); const row = data?.schedules.find((item) => item.staffId === person.id && item.shiftDate.slice(0, 10) === date); const absence = data?.absences.find((item) => item.staffId === person.id && item.status === 'approved' && item.startsOn.slice(0, 10) <= date && item.endsOn.slice(0, 10) >= date); return <div key={date} className="grid min-h-16 place-items-center border-l border-surface-3 p-1.5">{absence ? <span className="rounded-[5px] bg-[#593127] px-2 py-1 text-center text-[10px] text-coral-tint">{ABSENCE_LABEL[absence.type]}</span> : row ? <div className={`w-full rounded-[5px] px-1.5 py-1 text-center font-mono text-[10px] ${row.cancelledAt ? 'bg-surface-3 text-subtle' : 'bg-[#26351B] text-lime'}`}><span className="block">{row.cancelledAt ? 'отменена' : `${time(row.startsAt)}–${time(row.endsAt)}`}</span>{row.attendance ? <small className="mt-0.5 block text-success-soft">{row.attendance.checkedOutAt ? 'закрыта' : 'на смене'}</small> : <span className="mt-1 flex justify-center gap-2 font-sans"><button type="button" aria-label={`Изменить смену ${person.username} ${date}`} onClick={() => editSchedule(row)} className="text-bright">изменить</button>{!row.cancelledAt && <button type="button" aria-label={`Отменить смену ${person.username} ${date}`} disabled={busy === row.id} onClick={() => cancelSchedule(row)} className="text-danger-soft">отменить</button>}</span>}</div> : <span className="text-[#5F5750]">выходной</span>}</div>; })}
          </div>)}
          {!data?.staff.length && <div className="p-10 text-center text-sm text-subtle">Сотрудников пока нет</div>}
        </div>
        <form onSubmit={submitSchedule} className="grid gap-2 border-t border-surface-3 pt-4 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
          <select aria-label="Сотрудник HR" value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm">{data?.staff.map((person) => <option key={person.id} value={person.id}>{person.username} · {person.role}</option>)}</select>
          <input aria-label="Дата смены" type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
          <input aria-label="Начало смены" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
          <input aria-label="Конец смены" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-line bg-surface px-3 text-sm" />
          <button disabled={busy === 'schedule' || !selectedStaff} className="h-10 rounded-[6px] bg-coral-soft px-4 text-sm font-bold text-white disabled:opacity-50">{editingId ? 'Сохранить' : 'Назначить'}</button>
        </form>
      </>}

      {tab === 'timesheet' && <div className="overflow-hidden rounded-[7px] border border-surface-3">
        <div className="grid grid-cols-[minmax(130px,1fr)_70px_90px_90px_100px] bg-surface px-4 py-3 text-[10px] uppercase text-subtle"><span>Сотрудник</span><span>Смены</span><span>Часы</span><span>Опоздание</span><span>Переработка</span></div>
        {data?.timesheet.map((row) => <div key={row.staffId} data-testid={`timesheet-${row.staffId}`} className="grid grid-cols-[minmax(130px,1fr)_70px_90px_90px_100px] border-t border-surface-3 px-4 py-3 text-xs"><strong className="truncate">{row.username}</strong><span>{row.shifts}</span><span className="font-mono">{hours(row.minutes)}</span><span className={row.lateMinutes ? 'text-danger-soft' : 'text-success-soft'}>{row.lateMinutes}м</span><span className="text-lime">+{row.overtimeMinutes}м</span></div>)}
      </div>}

      {tab === 'payroll' && <div className="space-y-4" data-testid="hr-payroll">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-3 pb-4">
          <label className="text-[10px] text-subtle">Период<input aria-label="Период начисления" type="month" value={payrollPeriod} onChange={(event) => setPayrollPeriod(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-line bg-surface px-2 text-xs text-white" /></label>
          <div className="text-right"><div className="text-[10px] uppercase text-subtle">К выплате</div><strong className="font-mono text-xl text-lime">{som(payroll?.totals.payout ?? 0)}</strong></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {[['Оклад', payroll?.totals.base ?? 0], ['Комиссия', payroll?.totals.commission ?? 0], ['Корректировки', payroll?.totals.adjustments ?? 0], ['Итого', payroll?.totals.payout ?? 0]].map(([label, value]) => <div key={String(label)} className="border-b border-surface-3 bg-surface px-4 py-3"><span className="text-[10px] uppercase text-subtle">{label}</span><strong className="mt-1 block font-mono text-sm">{som(Number(value))}</strong></div>)}
        </div>
        <div className="overflow-x-auto rounded-[7px] border border-surface-3">
          <div className="grid min-w-[920px] grid-cols-[minmax(150px,1.4fr)_80px_90px_100px_110px_100px_110px_110px] bg-surface px-4 py-3 text-[10px] uppercase text-subtle"><span>Сотрудник</span><span>Смены</span><span>Часы</span><span>Продажи</span><span>Оборот</span><span>Оклад</span><span>Корректировки</span><span>Итого</span></div>
          {payroll?.lines.map((line) => <div key={line.staffId} data-testid={`payroll-${line.staffId}`} className="grid min-w-[920px] grid-cols-[minmax(150px,1.4fr)_80px_90px_100px_110px_100px_110px_110px] border-t border-surface-3 px-4 py-3 text-xs"><strong className="truncate">{line.username}</strong><span>{line.completedShifts}/{line.plannedShifts}</span><span>{hours(line.workedMinutes)}</span><span>{line.sales}</span><span className="font-mono">{som(line.revenue)}</span><span className="font-mono">{som(line.baseEarned)}</span><span className={line.overtimePay - line.lateDeduction >= 0 ? 'text-success-soft' : 'text-danger-soft'}>{som(line.overtimePay - line.lateDeduction)}</span><strong className="font-mono text-lime">{som(line.total)}</strong></div>)}
          {!payroll?.lines.length && <div className="p-10 text-center text-sm text-subtle">За период нет смен или продаж</div>}
        </div>
        {!payrollRuns.length && <button type="button" onClick={submitPayroll} disabled={busy === 'payroll-post' || !payroll?.lines.length} className="h-10 rounded-[6px] bg-coral-soft px-5 text-sm font-bold text-white disabled:opacity-50">{busy === 'payroll-post' ? 'Проводим…' : 'Провести начисление'}</button>}
        {payrollRuns.map((run) => <section key={run.id} className="flex flex-wrap items-end gap-3 border-t border-surface-3 pt-4 text-xs"><div className="min-w-0 flex-1"><strong>{run.status === 'paid' ? 'Выплачено' : 'Проведено'} · {som(run.totalPayout)}</strong><p className="mt-1 text-subtle">Снимок периода неизменяем · {run.externalRef ?? 'платёжный документ не указан'}</p></div>{run.status === 'posted' && <><input aria-label="Номер платёжного документа" value={payrollRef} onChange={(event) => setPayrollRef(event.target.value)} placeholder="BANK-2026-07-001" className="h-10 w-52 rounded-[6px] border border-line bg-surface px-3 text-sm" /><button type="button" onClick={() => submitPayrollPayment(run.id)} disabled={!payrollRef.trim() || busy === `payroll-pay-${run.id}`} className="h-10 rounded-[6px] bg-[#26351B] px-4 font-semibold text-lime disabled:opacity-50">Отметить выплату</button></>}</section>)}
      </div>}

      {tab === 'profile' && <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <section className="rounded-[7px] border border-surface-3 bg-surface p-5"><div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-3 text-xl font-bold">{chosen?.username.slice(0, 1).toUpperCase() || '—'}</div><h3 className="font-display text-lg font-bold">{chosen?.username || 'Сотрудник'}</h3><p className="mt-1 text-xs text-subtle">{chosen?.role || '—'} · {chosen?.active ? 'активен' : 'отключён'}</p><select aria-label="Профиль сотрудника" value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="mt-5 h-10 w-full rounded-[6px] border border-line bg-ink-dark px-3 text-sm">{data?.staff.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}</select></section>
        <section className="rounded-[7px] border border-surface-3 bg-ink-dark p-5"><h3 className="font-display text-sm font-bold">Отсутствия</h3><div className="mt-3 space-y-2">{chosenAbsences.map((absence) => <article key={absence.id} className="flex flex-wrap items-center gap-3 border-t border-surface-3 py-3 text-xs"><div className="min-w-0 flex-1"><strong>{ABSENCE_LABEL[absence.type] ?? absence.type}</strong><div className="mt-1 text-subtle">{absence.startsOn.slice(0, 10)} — {absence.endsOn.slice(0, 10)} · {absence.status}</div>{absence.reason && <p className="mt-1 text-[#B9ADA2]">{absence.reason}</p>}</div>{absence.status === 'requested' && <div className="flex gap-2"><button disabled={busy === absence.id} onClick={() => decide(absence.id, 'rejected')} className="text-danger-soft">Отклонить</button><button disabled={busy === absence.id} onClick={() => decide(absence.id, 'approved')} className="rounded-[5px] bg-[#26351B] px-3 py-1.5 font-semibold text-lime">Одобрить</button></div>}</article>)}{!chosenAbsences.length && <div className="border-t border-surface-3 py-8 text-center text-sm text-subtle">Запросов нет</div>}</div></section>
      </div>}

      {tab === 'handover' && <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <section className="overflow-hidden rounded-[7px] border border-surface-3 bg-ink-dark">
          <div className="grid grid-cols-[minmax(130px,1fr)_100px_110px] bg-surface px-4 py-3 text-[10px] uppercase text-subtle"><span>Открытая касса</span><span>Точка</span><span>Ожидается</span></div>
          {handovers?.shifts.map((shift) => <button key={shift.id} type="button" onClick={() => { setSourceShiftId(shift.id); setCountedCash(String(shift.expectedCash)); }} className={`grid w-full grid-cols-[minmax(130px,1fr)_100px_110px] border-t px-4 py-3 text-left text-xs ${sourceShiftId === shift.id ? 'border-coral-soft bg-surface-3' : 'border-surface-3'}`}><span><strong className="block truncate">{shift.staff?.username ?? shift.staffId}</strong><small className="text-subtle">с {new Date(shift.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small></span><span>{shift.point}</span><span className="font-mono text-lime">{som(shift.expectedCash)}</span></button>)}
          {!handovers?.shifts.length && <div className="grid min-h-44 place-items-center text-sm text-subtle">Открытых кассовых смен нет</div>}
        </section>
        <form onSubmit={submitHandover} className="rounded-[7px] border border-surface-3 bg-surface p-5">
          <h3 className="font-display text-sm font-bold">Передать кассу</h3>
          <label className="mt-4 block text-[10px] text-subtle">Получатель<select aria-label="Получатель смены" value={targetStaffId} onChange={(event) => setTargetStaffId(event.target.value)} className="mt-1 h-10 w-full rounded-[6px] border border-line bg-ink-dark px-3 text-sm"><option value="">Выберите сотрудника</option>{handovers?.staff.filter((staff) => !handovers.shifts.some((shift) => shift.staffId === staff.id)).map((staff) => <option key={staff.id} value={staff.id}>{staff.username} · {staff.role}</option>)}</select></label>
          <label className="mt-3 block text-[10px] text-subtle">Фактически в кассе<input aria-label="Сумма передачи" type="number" min="0" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} className="mt-1 h-10 w-full rounded-[6px] border border-line bg-ink-dark px-3 font-mono text-sm" /></label>
          {sourceShiftId && Number(countedCash) !== (handovers?.shifts.find((shift) => shift.id === sourceShiftId)?.expectedCash ?? 0) && <label className="mt-3 block text-[10px] text-danger-soft">Причина расхождения<input aria-label="Причина передачи" value={handoverReason} onChange={(event) => setHandoverReason(event.target.value)} className="mt-1 h-10 w-full rounded-[6px] border border-[#6B3B32] bg-ink-dark px-3 text-sm" /></label>}
          <button disabled={busy === 'handover' || !sourceShiftId || !targetStaffId} className="mt-4 h-10 w-full rounded-[6px] bg-coral-soft text-sm font-bold text-white disabled:opacity-50">{busy === 'handover' ? 'Передаём…' : 'Сверить и передать'}</button>
        </form>
      </div>}
    </div>
  );
}
