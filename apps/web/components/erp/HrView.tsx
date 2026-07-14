'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createHrSchedule, decideHrAbsence, fetchHrWeek, type HrWeek } from '@/lib/api';

type Tab = 'schedule' | 'timesheet' | 'profile' | 'handover';
const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule', label: 'График смен' }, { id: 'timesheet', label: 'Табель' },
  { id: 'profile', label: 'Профиль' }, { id: 'handover', label: 'Передача смены' },
];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const ABSENCE_LABEL: Record<string, string> = { annual_leave: 'Отпуск', sick_leave: 'Больничный', unpaid_leave: 'Без оплаты', other: 'Другое' };

function mondayIso() {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  return now.toISOString().slice(0, 10);
}

function dayIso(start: string, offset: number) {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function time(value: string) { return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' }); }
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
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const reload = useCallback(() => {
    setMessage('');
    fetchHrWeek(weekStart, point, accessToken).then((result) => {
      setData(result);
      setSelectedStaff((current) => current || result.staff[0]?.id || '');
    }).catch((error) => { setData(null); setMessage(error instanceof Error ? error.message : 'Не удалось загрузить HR'); });
  }, [accessToken, point, weekStart]);
  useEffect(() => reload(), [reload]);
  useEffect(() => setShiftDate(weekStart), [weekStart]);

  const chosen = data?.staff.find((person) => person.id === selectedStaff);
  const chosenAbsences = useMemo(() => data?.absences.filter((absence) => absence.staffId === selectedStaff) ?? [], [data, selectedStaff]);

  async function submitSchedule(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff || !point.trim()) return;
    setBusy('schedule'); setMessage('');
    try {
      const localIso = (clock: string) => new Date(`${shiftDate}T${clock}:00+06:00`).toISOString();
      await createHrSchedule({ staffId: selectedStaff, point: point.trim(), shiftDate, startsAt: localIso(startTime), endsAt: localIso(endTime) }, accessToken);
      reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось назначить смену'); }
    finally { setBusy(''); }
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(id); setMessage('');
    try { await decideHrAbsence(id, status, accessToken); reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Решение не сохранено'); }
    finally { setBusy(''); }
  }

  return (
    <div data-testid="hr-view" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#2E2822] pb-4">
        <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist">
          {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`h-9 whitespace-nowrap border-b-2 px-3 text-xs font-semibold ${tab === item.id ? 'border-[#FF6B55] text-white' : 'border-transparent text-[#8A7F76]'}`}>{item.label}</button>)}
        </div>
        <div className="flex gap-2">
          <label className="text-[10px] text-[#8A7F76]">Неделя<input aria-label="Неделя HR" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} className="mt-1 block h-9 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-2 text-xs text-white" /></label>
          <label className="text-[10px] text-[#8A7F76]">Точка<input aria-label="Точка HR" value={point} onChange={(event) => setPoint(event.target.value)} className="mt-1 block h-9 w-32 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-2 text-xs text-white" /></label>
        </div>
      </div>
      {message && <div role="alert" className="rounded-[6px] border border-[#FF6B55]/40 bg-[#FF6B55]/10 px-3 py-2 text-xs text-[#FFB5AA]">{message}</div>}

      {tab === 'schedule' && <>
        <div className="overflow-x-auto rounded-[7px] border border-[#2E2822]">
          <div className="grid min-w-[780px] grid-cols-[150px_repeat(7,minmax(86px,1fr))] bg-[#1A1611] text-[10px] uppercase text-[#8A7F76]"><span className="p-3">Сотрудник</span>{DAYS.map((day, index) => <span key={day} className="border-l border-[#2E2822] p-3 text-center">{day}<small className="ml-1 text-[#5F5750]">{dayIso(weekStart, index).slice(8)}</small></span>)}</div>
          {(data?.staff ?? []).map((person) => <div key={person.id} data-testid={`hr-row-${person.id}`} className="grid min-w-[780px] grid-cols-[150px_repeat(7,minmax(86px,1fr))] border-t border-[#2E2822] bg-[#16130F] text-xs">
            <button type="button" onClick={() => { setSelectedStaff(person.id); setTab('profile'); }} className="min-w-0 p-3 text-left"><strong className="block truncate">{person.username}</strong><span className="text-[10px] text-[#8A7F76]">{person.role}</span></button>
            {DAYS.map((_, index) => { const date = dayIso(weekStart, index); const row = data?.schedules.find((item) => item.staffId === person.id && item.shiftDate.slice(0, 10) === date); const absence = data?.absences.find((item) => item.staffId === person.id && item.status === 'approved' && item.startsOn.slice(0, 10) <= date && item.endsOn.slice(0, 10) >= date); return <div key={date} className="grid min-h-16 place-items-center border-l border-[#2E2822] p-1.5">{absence ? <span className="rounded-[5px] bg-[#593127] px-2 py-1 text-center text-[10px] text-[#FFB5AA]">{ABSENCE_LABEL[absence.type]}</span> : row ? <span className="rounded-[5px] bg-[#26351B] px-2 py-1 text-center font-mono text-[11px] text-[#C6FF3D]">{time(row.startsAt)}–{time(row.endsAt)}{row.attendance && <small className="mt-0.5 block text-[#7FD3A0]">{row.attendance.checkedOutAt ? 'закрыта' : 'на смене'}</small>}</span> : <span className="text-[#5F5750]">выходной</span>}</div>; })}
          </div>)}
          {!data?.staff.length && <div className="p-10 text-center text-sm text-[#8A7F76]">Сотрудников пока нет</div>}
        </div>
        <form onSubmit={submitSchedule} className="grid gap-2 border-t border-[#2E2822] pt-4 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
          <select aria-label="Сотрудник HR" value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm">{data?.staff.map((person) => <option key={person.id} value={person.id}>{person.username} · {person.role}</option>)}</select>
          <input aria-label="Дата смены" type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
          <input aria-label="Начало смены" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
          <input aria-label="Конец смены" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="h-10 min-w-0 rounded-[6px] border border-[#3A332C] bg-[#1A1611] px-3 text-sm" />
          <button disabled={busy === 'schedule' || !selectedStaff} className="h-10 rounded-[6px] bg-[#FF6B55] px-4 text-sm font-bold text-white disabled:opacity-50">Назначить</button>
        </form>
      </>}

      {tab === 'timesheet' && <div className="overflow-hidden rounded-[7px] border border-[#2E2822]">
        <div className="grid grid-cols-[minmax(130px,1fr)_70px_90px_90px_100px] bg-[#1A1611] px-4 py-3 text-[10px] uppercase text-[#8A7F76]"><span>Сотрудник</span><span>Смены</span><span>Часы</span><span>Опоздание</span><span>Переработка</span></div>
        {data?.timesheet.map((row) => <div key={row.staffId} data-testid={`timesheet-${row.staffId}`} className="grid grid-cols-[minmax(130px,1fr)_70px_90px_90px_100px] border-t border-[#2E2822] px-4 py-3 text-xs"><strong className="truncate">{row.username}</strong><span>{row.shifts}</span><span className="font-mono">{hours(row.minutes)}</span><span className={row.lateMinutes ? 'text-[#FF8A7A]' : 'text-[#7FD3A0]'}>{row.lateMinutes}м</span><span className="text-[#C6FF3D]">+{row.overtimeMinutes}м</span></div>)}
      </div>}

      {tab === 'profile' && <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <section className="rounded-[7px] border border-[#2E2822] bg-[#1A1611] p-5"><div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#2A241F] text-xl font-bold">{chosen?.username.slice(0, 1).toUpperCase() || '—'}</div><h3 className="font-display text-lg font-bold">{chosen?.username || 'Сотрудник'}</h3><p className="mt-1 text-xs text-[#8A7F76]">{chosen?.role || '—'} · {chosen?.active ? 'активен' : 'отключён'}</p><select aria-label="Профиль сотрудника" value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="mt-5 h-10 w-full rounded-[6px] border border-[#3A332C] bg-[#16130F] px-3 text-sm">{data?.staff.map((person) => <option key={person.id} value={person.id}>{person.username}</option>)}</select></section>
        <section className="rounded-[7px] border border-[#2E2822] bg-[#16130F] p-5"><h3 className="font-display text-sm font-bold">Отсутствия</h3><div className="mt-3 space-y-2">{chosenAbsences.map((absence) => <article key={absence.id} className="flex flex-wrap items-center gap-3 border-t border-[#2E2822] py-3 text-xs"><div className="min-w-0 flex-1"><strong>{ABSENCE_LABEL[absence.type] ?? absence.type}</strong><div className="mt-1 text-[#8A7F76]">{absence.startsOn.slice(0, 10)} — {absence.endsOn.slice(0, 10)} · {absence.status}</div>{absence.reason && <p className="mt-1 text-[#B9ADA2]">{absence.reason}</p>}</div>{absence.status === 'requested' && <div className="flex gap-2"><button disabled={busy === absence.id} onClick={() => decide(absence.id, 'rejected')} className="text-[#FF8A7A]">Отклонить</button><button disabled={busy === absence.id} onClick={() => decide(absence.id, 'approved')} className="rounded-[5px] bg-[#26351B] px-3 py-1.5 font-semibold text-[#C6FF3D]">Одобрить</button></div>}</article>)}{!chosenAbsences.length && <div className="border-t border-[#2E2822] py-8 text-center text-sm text-[#8A7F76]">Запросов нет</div>}</div></section>
      </div>}

      {tab === 'handover' && <div className="grid min-h-52 place-items-center rounded-[7px] border border-[#2E2822] bg-[#16130F] text-sm text-[#8A7F76]">Нет активной передачи смены</div>}
    </div>
  );
}
