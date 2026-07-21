'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, HTMLAttributes } from 'react';
import { closeShift, currentShift, openShift, type Shift } from '@/lib/staff';
import {
  createCustomer,
  createTradeIn,
  downloadOrderInvoice,
  downloadTradeInContract,
  fetchOrderReceipt,
  fetchOrdersByStatus,
  fulfillOrder,
  printServerSvg,
  transitionOrder,
  uploadEvidenceImages,
  fetchB2BQuotes,
  updateB2BQuote,
  type StaffB2BQuote,
  fetchProtectionQueue,
  updateProtection,
  type DeviceProtectionPolicy,
  type QueueOrder,
  type TradeIn,
  type TradeInGrade,
  fetchMyStaffTasks,
  updateMyStaffTask,
  type StaffTask,
  fetchMyHrWeek,
  openMyAttendance,
  closeMyAttendance,
  requestMyAbsence,
  type HrAbsenceType,
  type HrSchedule,
  type HrWeek,
} from '@/lib/api';
import { som } from '@/lib/format';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { DebtsDesk } from '@/components/staff/DebtsDesk';
import { GiftCardIssue } from '@/components/staff/GiftCardIssue';
import { canCreateDebt, canIssueGiftCard, canPayDebt, canPrintDocuments, canPrintReceipts, staffTabAllowed, type StaffAppTab } from '@/lib/staff-permissions';
import {
  clearStaffSession,
  loadStaffSession,
  restoreStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

const POINT = 'BISHKEK-1';
const SHOP = 'AliStore Центр';

type Tab = StaffAppTab | 'debts' | 'cards';
const NAV: { id: StaffAppTab; icon: string; label: string }[] = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'orders', icon: '📦', label: 'Заказы' },
  { id: 'tasks', icon: '📊', label: 'KPI' },
  { id: 'buyback', icon: '♻️', label: 'Скупка' },
  { id: 'hr', icon: '◫', label: 'HR' },
];
const BUYBACK = ['Проверить IMEI по базе краденого', 'Осмотреть состояние, присвоить грейд', 'Сделать фото (4 ракурса)', 'Внести данные клиента и паспорт'];
const ABSENCE_LABEL: Record<string, string> = { annual_leave: 'Отпуск', sick_leave: 'Больничный', unpaid_leave: 'Без оплаты', other: 'Другое' };
const ABSENCE_STATUS_LABEL: Record<string, string> = { requested: 'На согласовании', approved: 'Одобрено', rejected: 'Отклонено', cancelled: 'Отменено' };

function mondayIso() {
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  return now.toISOString().slice(0, 10);
}
function clock(value: string) { return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Bishkek' }); }

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>('home');
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [b2bQuotes, setB2BQuotes] = useState<StaffB2BQuote[] | null>(null);
  const [quoteTotals, setQuoteTotals] = useState<Record<string, string>>({});
  const [protection, setProtection] = useState<DeviceProtectionPolicy[] | null>(null);
  const [protectionPremiums, setProtectionPremiums] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<StaffTask[] | null>(null);
  const [taskError, setTaskError] = useState('');
  const [buyback, setBuyback] = useState<boolean[]>(BUYBACK.map(() => false));
  const [tradeIn, setTradeIn] = useState<TradeIn | null>(null);
  const [buybackForm, setBuybackForm] = useState({
    phone: '+996',
    name: '',
    model: '',
    imei: '',
    grade: 'B' as TradeInGrade,
    price: '',
    passport: '',
  });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [openShiftFiles, setOpenShiftFiles] = useState<File[]>([]);
  const [closeShiftFiles, setCloseShiftFiles] = useState<File[]>([]);
  const [closeCash, setCloseCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closeShiftKey, setCloseShiftKey] = useState(() => crypto.randomUUID());
  const [lastReconciliation, setLastReconciliation] = useState<{
    counted: number;
    expected: number;
    diff: number;
  } | null>(null);
  const [pendingCloseEvidence, setPendingCloseEvidence] = useState<{
    shiftId: string;
    files: File[];
    keyPrefix: string;
  } | null>(null);
  const previousShiftId = useRef<string | null>(null);
  const shiftLoadVersion = useRef(0);
  const sessionVersion = useRef(0);
  const [hrWeek, setHrWeek] = useState<HrWeek | null>(null);
  const [hrError, setHrError] = useState('');
  const [absenceForm, setAbsenceForm] = useState({ type: 'annual_leave' as HrAbsenceType, startsOn: '', endsOn: '', reason: '' });

  useEffect(() => {
    void restoreStaffSession().then(setSession);
  }, []);

  useEffect(() => {
    sessionVersion.current += 1;
    shiftLoadVersion.current += 1;
    setBusy(null);
    setShift(undefined);
    setOpenShiftFiles([]);
    setCloseShiftFiles([]);
    setCloseCash('');
    setCloseNote('');
    setCloseShiftKey(crypto.randomUUID());
    setLastReconciliation(null);
    setPendingCloseEvidence(null);
    previousShiftId.current = null;
  }, [session?.staffId]);

  useEffect(() => {
    const activeShiftId = shift?.id ?? null;
    if (activeShiftId && previousShiftId.current !== activeShiftId) {
      setCloseShiftFiles([]);
      setCloseCash('');
      setCloseNote('');
      setCloseShiftKey(crypto.randomUUID());
      setLastReconciliation(null);
      setPendingCloseEvidence(null);
      previousShiftId.current = activeShiftId;
    }
  }, [shift?.id]);

  const loadShift = useCallback(async () => {
    if (!session) return;
    const requestVersion = ++shiftLoadVersion.current;
    const loaded = await currentShift(session.accessToken);
    const persistedSession = loadStaffSession();
    if (
      requestVersion === shiftLoadVersion.current
      && persistedSession?.staffId === session.staffId
    ) {
      setShift(loaded);
    }
  }, [session]);
  useEffect(() => { if (session) loadShift(); }, [loadShift, session]);

  const loadOrders = useCallback(async () => {
    if (!session) return;
    setOrders(null);
    const [a, b] = await Promise.all([
      fetchOrdersByStatus('created', session.accessToken),
      fetchOrdersByStatus('reserved', session.accessToken),
    ]);
    setOrders([...a, ...b]);
  }, [session]);
  useEffect(() => { if (tab === 'orders' && session && staffTabAllowed(session.role, 'orders')) loadOrders(); }, [tab, loadOrders, session]);

  const loadB2B = useCallback(async () => {
    if (!session) return;
    setB2BQuotes(null);
    const rows = await fetchB2BQuotes(session.accessToken);
    setB2BQuotes(rows);
    setQuoteTotals((current) => Object.fromEntries(rows.map((quote) => [
      quote.id,
      current[quote.id] ?? String(quote.quotedTotal ?? quote.listTotal),
    ])));
  }, [session]);
  useEffect(() => { if (tab === 'b2b' && session) loadB2B(); }, [tab, loadB2B, session]);

  const loadProtection = useCallback(async () => {
    if (!session) return;
    setProtection(null);
    const rows = await fetchProtectionQueue(session.accessToken);
    setProtection(rows);
    setProtectionPremiums((current) => Object.fromEntries(rows.map((policy) => [
      policy.id,
      current[policy.id] ?? String(policy.premium ?? ''),
    ])));
  }, [session]);
  useEffect(() => { if (tab === 'protection' && session) loadProtection(); }, [tab, loadProtection, session]);

  const loadTasks = useCallback(async () => {
    if (!session) return;
    setTasks(null);
    setTaskError('');
    try {
      setTasks(await fetchMyStaffTasks(session.accessToken));
    } catch (error) {
      setTasks([]);
      setTaskError(error instanceof Error ? error.message : 'Не удалось загрузить задачи');
    }
  }, [session]);
  useEffect(() => { if (tab === 'tasks' && session) loadTasks(); }, [tab, loadTasks, session]);

  const loadHr = useCallback(async () => {
    if (!session) return;
    setHrWeek(null);
    setHrError('');
    try {
      setHrWeek(await fetchMyHrWeek(mondayIso(), session.accessToken));
    } catch (error) {
      setHrWeek(null);
      setHrError(error instanceof Error ? error.message : 'Не удалось загрузить неделю');
    }
  }, [session]);
  useEffect(() => { if (tab === 'hr' && session) loadHr(); }, [tab, loadHr, session]);

  async function attendanceAction(schedule: HrSchedule, action: 'open' | 'close') {
    if (!session) return;
    setBusy(schedule.id);
    try {
      if (action === 'open') { await openMyAttendance(schedule.id, session.accessToken); flash('Приход отмечен'); }
      else { await closeMyAttendance(schedule.id, session.accessToken); flash('Уход отмечен'); }
      await loadHr();
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка отметки');
    } finally {
      setBusy(null);
    }
  }
  async function submitAbsence(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy('absence');
    try {
      await requestMyAbsence({
        type: absenceForm.type,
        startsOn: absenceForm.startsOn,
        endsOn: absenceForm.endsOn,
        reason: absenceForm.reason.trim() || undefined,
      }, session.accessToken);
      setAbsenceForm({ type: 'annual_leave', startsOn: '', endsOn: '', reason: '' });
      flash('Запрос отсутствия отправлен');
      await loadHr();
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка запроса');
    } finally {
      setBusy(null);
    }
  }

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(''), 1600); }

  async function taskAction(task: StaffTask) {
    if (!session || task.status === 'completed') return;
    setBusy(task.id);
    try {
      await updateMyStaffTask(task.id, task.status === 'open' ? 'in_progress' : 'completed', session.accessToken);
      await loadTasks();
      flash('Задача обновлена');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Не удалось обновить задачу');
    } finally {
      setBusy(null);
    }
  }
  function fileList(event: ChangeEvent<HTMLInputElement>) {
    return Array.from(event.target.files ?? []);
  }

  async function doOpenShift() {
    if (!session) return;
    const operationVersion = sessionVersion.current;
    const operationStaffId = session.staffId;
    setBusy('shift');
    try {
      const opened = await openShift({ staffId: session.staffId, point: POINT, openCash: 0 }, session.accessToken);
      if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
      const evidence = openShiftFiles.length
        ? await uploadEvidenceImages({
          files: openShiftFiles,
          entityType: 'shift',
          entityId: opened.id,
          label: 'shift_open_photo',
          actor: session.staffId,
          accessToken: session.accessToken,
        })
        : [];
      if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
      setOpenShiftFiles([]);
      await loadShift();
      if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
      flash(`Смена открыта · фото ${evidence.length}`);
    }
    catch {
      if (sessionIsCurrent(operationStaffId, operationVersion)) flash('Ошибка');
    } finally {
      if (sessionIsCurrent(operationStaffId, operationVersion)) setBusy(null);
    }
  }
  async function doCloseShift() {
    if (!shift || !session) return;
    if (!closeCash.trim()) {
      flash('Укажите фактически пересчитанную сумму');
      return;
    }
    const counted = Number(closeCash);
    if (!Number.isInteger(counted) || counted < 0) {
      flash('Укажите фактически пересчитанную сумму');
      return;
    }
    if (!window.confirm(`Закрыть смену с фактической суммой ${som(counted)}? После отправки изменить пересчёт нельзя.`)) return;
    const operationVersion = sessionVersion.current;
    const operationStaffId = session.staffId;
    setBusy('shift');
    try {
      const shiftId = shift.id;
      const evidenceFiles = closeShiftFiles;
      const evidenceKeyPrefix = `shift-close:${closeShiftKey}`;
      const closed = await closeShift(
        shiftId,
        counted,
        session.accessToken,
        closeShiftKey,
        closeNote.trim() || undefined,
      );
      if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
      setCloseShiftFiles([]);
      setCloseCash('');
      setCloseNote('');
      setCloseShiftKey(crypto.randomUUID());
      setLastReconciliation({
        counted,
        expected: closed.expected,
        diff: closed.diff,
      });
      setShift(null);
      const diff = closed.diff;
      if (!evidenceFiles.length) {
        flash(diff === 0 ? 'Касса сошлась' : `Расхождение ${som(diff)}`);
        return;
      }
      try {
        const evidence = await uploadEvidenceImages({
          files: evidenceFiles,
          entityType: 'shift',
          entityId: shiftId,
          label: 'shift_close_photo',
          actor: session.staffId,
          accessToken: session.accessToken,
          idempotencyKeyPrefix: evidenceKeyPrefix,
        });
        if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
        setPendingCloseEvidence(null);
        flash(`${diff === 0 ? 'Касса сошлась' : `Расхождение ${som(diff)}`} · фото ${evidence.length}`);
      } catch {
        if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
        setPendingCloseEvidence({ shiftId, files: evidenceFiles, keyPrefix: evidenceKeyPrefix });
        flash('Смена закрыта · фото ожидают повторной отправки');
      }
    }
    catch {
      if (sessionIsCurrent(operationStaffId, operationVersion)) flash('Ошибка закрытия');
    } finally {
      if (sessionIsCurrent(operationStaffId, operationVersion)) setBusy(null);
    }
  }

  async function retryCloseEvidence() {
    if (!pendingCloseEvidence || !session) return;
    const operationVersion = sessionVersion.current;
    const operationStaffId = session.staffId;
    setBusy('shift-evidence');
    try {
      const evidence = await uploadEvidenceImages({
        files: pendingCloseEvidence.files,
        entityType: 'shift',
        entityId: pendingCloseEvidence.shiftId,
        label: 'shift_close_photo',
        actor: session.staffId,
        accessToken: session.accessToken,
        idempotencyKeyPrefix: pendingCloseEvidence.keyPrefix,
      });
      if (!sessionIsCurrent(operationStaffId, operationVersion)) return;
      setPendingCloseEvidence(null);
      flash(`Фото закрытия сохранены · ${evidence.length}`);
    } catch {
      if (sessionIsCurrent(operationStaffId, operationVersion)) {
        flash('Фото не отправлены · повторите ещё раз');
      }
    } finally {
      if (sessionIsCurrent(operationStaffId, operationVersion)) setBusy(null);
    }
  }

  function sessionIsCurrent(staffId: string, version: number) {
    return (
      sessionVersion.current === version
      && loadStaffSession()?.staffId === staffId
    );
  }
  async function orderAction(o: QueueOrder) {
    if (!session) return;
    setBusy(o.id);
    try {
      if (o.status === 'created') { await fulfillOrder(o.id, session.accessToken); flash('IMEI назначены'); }
      else { await transitionOrder(o.id, 'picking', session.accessToken); flash('В сборке'); }
      loadOrders();
    } catch (e) { flash(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(null); }
  }
  async function printInvoice(o: QueueOrder) {
    if (!session) return;
    setBusy(`invoice-${o.id}`);
    try {
      await downloadOrderInvoice(o.id, session.accessToken);
      flash('Накладная скачана');
    } catch (e) { flash(e instanceof Error ? e.message : 'Ошибка накладной'); } finally { setBusy(null); }
  }
  async function printReceipt(o: QueueOrder) {
    if (!session) return;
    setBusy(`receipt-${o.id}`);
    try {
      const rendered = await fetchOrderReceipt(o.id, session.accessToken);
      printServerSvg(rendered.svg, `Чек ${o.id.slice(-6)}`);
    } catch (e) { flash(e instanceof Error ? e.message : 'Ошибка чека'); } finally { setBusy(null); }
  }
  async function quoteAction(quote: StaffB2BQuote, status: 'reviewing' | 'quoted' | 'rejected') {
    if (!session) return;
    setBusy(quote.id);
    try {
      await updateB2BQuote(quote.id, {
        status,
        quotedTotal: status === 'quoted' ? Number(quoteTotals[quote.id]) : undefined,
        validUntil: status === 'quoted' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      }, session.accessToken);
      await loadB2B();
      flash(status === 'quoted' ? 'КП отправлено' : status === 'reviewing' ? 'Заявка в работе' : 'Заявка отклонена');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка B2B');
    } finally {
      setBusy(null);
    }
  }
  async function protectionAction(policy: DeviceProtectionPolicy, status: 'reviewing' | 'offered' | 'rejected') {
    if (!session) return;
    setBusy(policy.id);
    try {
      await updateProtection(policy.id, {
        status,
        premium: status === 'offered' ? Number(protectionPremiums[policy.id]) : undefined,
      }, session.accessToken);
      await loadProtection();
      flash(status === 'offered' ? 'Предложение отправлено' : status === 'reviewing' ? 'Заявка в работе' : 'Заявка отклонена');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Ошибка защиты');
    } finally {
      setBusy(null);
    }
  }
  async function submitBuyback(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy('buyback');
    try {
      const customer = await createCustomer({
        phone: buybackForm.phone.trim(),
        name: buybackForm.name.trim() || 'Клиент скупки',
      });
      const result = await createTradeIn({
        customerId: customer.id,
        model: buybackForm.model.trim(),
        imei: buybackForm.imei.trim() || undefined,
        grade: buybackForm.grade,
        price: Number(buybackForm.price),
        sellerPassport: buybackForm.passport.trim(),
      }, { accessToken: session.accessToken, staffIntake: true });
      setTradeIn(result);
      setBuyback(BUYBACK.map(() => true));
      flash('Договор оформлен');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка скупки');
    } finally {
      setBusy(null);
    }
  }

  async function downloadContract() {
    if (!session || !tradeIn) return;
    setBusy('buyback-contract');
    try {
      await downloadTradeInContract(tradeIn.id, session.accessToken);
      flash('Договор скупки скачан');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка договора');
    } finally {
      setBusy(null);
    }
  }


  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex justify-center bg-[#0E0C0A] p-5 font-sans">
        <div className="flex h-full w-full max-w-[420px] items-center justify-center">
          <StaffSessionLogin
            title="Staff app · вход"
            caption="Войдите в рабочую смену."
            onAuthenticated={setSession}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="erp3-stage fixed inset-0 z-50 flex justify-center bg-[#0B0A08] font-sans sm:items-start sm:p-6">
      <main
        data-testid="staff-app"
        className="relative flex h-full w-full max-w-[402px] flex-col overflow-hidden bg-[#16130F] text-white sm:h-[858px] sm:max-h-[calc(100vh-48px)] sm:rounded-[46px] sm:border-[10px] sm:border-[#14110E] sm:shadow-2xl"
      >
        <div className="hidden h-11 flex-shrink-0 items-center justify-between px-5 text-[13px] font-semibold sm:flex">
          <span>9:41</span>
          <span className="font-mono">Сотрудник</span>
          <span>▪▪▪ 100%</span>
        </div>
        {/* header */}
        <div className="flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-5 sm:pt-1.5">
          <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-gradient-to-br from-coral to-deep font-display text-lg font-extrabold">
            {session.username.slice(0, 2).toUpperCase()}
          </span>
          <div className="flex-1">
            <div className="font-display text-base font-bold">{session.username}</div>
            <div className="text-xs text-[#8A7F76]">{session.role} · {SHOP}</div>
          </div>
          <span className={`rounded-chip px-3 py-1.5 text-xs font-semibold ${shift ? 'bg-lime/10 text-lime' : 'bg-[#221E19] text-[#8A7F76]'}`}>
            {shift ? '● на смене' : '○ вне смены'}
          </span>
          <button
            type="button"
            onClick={() => {
              sessionVersion.current += 1;
              shiftLoadVersion.current += 1;
              clearStaffSession();
              setSession(null);
              setShift(null);
              setOrders(null);
              setB2BQuotes(null);
              setProtection(null);
              setOpenShiftFiles([]);
              setCloseShiftFiles([]);
              setCloseCash('');
              setCloseNote('');
              setCloseShiftKey(crypto.randomUUID());
              setLastReconciliation(null);
              setPendingCloseEvidence(null);
              previousShiftId.current = null;
            }}
            className="text-[#8A7F76]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {tab === 'home' && (
            <>
              {shift === undefined ? (
                <p className="py-6 font-mono text-sm text-[#8A7F76]">Загрузка…</p>
              ) : shift ? (
                <div className="mb-4 rounded-[18px] border border-[#2E2822] bg-[#221E19] p-4.5" style={{ padding: 18 }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-lime">● Смена открыта</span>
                    <button type="button" disabled={busy === 'shift' || !closeCash.trim()} onClick={doCloseShift} className="text-xs text-[#FF8A7A] disabled:opacity-40">Закрыть</button>
                  </div>
                  <div className="mt-3.5 grid grid-cols-3 gap-2.5">
                    <Stat value={shift.point} label="точка" />
                    <Stat value={new Date(shift.openedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} label="открыта" />
                    <Stat value={som(shift.openCash)} label="размен" accent="#C6FF3D" />
                  </div>
                  <label className="mt-3 block text-[11px] font-semibold uppercase text-[#8A7F76]">
                    Фактически пересчитано
                    <input
                      aria-label="Фактически пересчитано в кассе"
                      inputMode="numeric"
                      value={closeCash}
                      onChange={(event) => setCloseCash(event.target.value.replace(/\D/g, ''))}
                      placeholder="Введите сумму после пересчёта"
                      className="mt-1.5 h-11 w-full rounded-[11px] border border-[#2E2822] bg-[#16130F] px-3 font-mono text-sm text-white outline-none focus:border-lime"
                    />
                  </label>
                  <label className="mt-3 block text-[11px] font-semibold uppercase text-[#8A7F76]">
                    Заметка
                    <input
                      aria-label="Заметка к пересчёту"
                      value={closeNote}
                      onChange={(event) => setCloseNote(event.target.value)}
                      placeholder="Необязательно"
                      className="mt-1.5 h-11 w-full rounded-[11px] border border-[#2E2822] bg-[#16130F] px-3 text-sm text-white outline-none focus:border-lime"
                    />
                  </label>
                  <label className="mt-3 block rounded-[12px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase text-[#8A7F76]">Фото закрытия</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => setCloseShiftFiles(fileList(event))}
                      className="mt-1 w-full text-xs text-[#D8CFC6] file:mr-3 file:rounded-[8px] file:border-0 file:bg-lime file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-lime-ink"
                    />
                    {closeShiftFiles.length > 0 && <span className="mt-1 block font-mono text-[11px] text-lime">{closeShiftFiles.length} фото</span>}
                  </label>
                  <p className="mt-3 text-[11px] leading-4 text-[#8A7F76]">
                    Ожидаемая сумма скрыта до отправки. Пересчитайте наличные самостоятельно.
                  </p>
                </div>
              ) : (
                <>
                {lastReconciliation && (
                  <div data-testid="staff-last-reconciliation" className="mb-3 rounded-[14px] border border-lime/30 bg-[#1D2415] p-4">
                    <div className="text-xs font-semibold uppercase text-lime">Сверка сохранена</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Stat value={som(lastReconciliation.counted)} label="фактически" />
                      <Stat value={som(lastReconciliation.expected)} label="ожидалось" />
                      <Stat
                        value={som(lastReconciliation.diff)}
                        label="расхождение"
                        accent={lastReconciliation.diff === 0 ? '#C6FF3D' : '#FF8A7A'}
                      />
                    </div>
                  </div>
                )}
                {pendingCloseEvidence && (
                  <div className="mb-3 rounded-[14px] border border-coral/30 bg-[#2A1B18] p-4">
                    <div className="text-xs font-semibold uppercase text-coral">Фото ожидают отправки</div>
                    <p className="mt-1 text-xs text-[#D8CFC6]">
                      Смена уже закрыта. Повтор затронет только {pendingCloseEvidence.files.length} фото.
                    </p>
                    <button
                      type="button"
                      disabled={busy === 'shift-evidence'}
                      onClick={retryCloseEvidence}
                      className="mt-3 rounded-[10px] bg-coral px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Повторить отправку фото
                    </button>
                  </div>
                )}
                <div className="mb-4 rounded-[18px] bg-gradient-to-br from-coral to-deep p-5">
                  <div className="font-display text-[17px] font-bold">Смена не открыта</div>
                  <div className="mt-1 text-[13px] leading-snug text-[#FFE0D5]">Откройте смену, чтобы принимать оплату и заказы.</div>
                  <label className="mt-3 block rounded-[12px] border border-white/20 bg-white/10 px-3 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase text-[#FFE0D5]">Фото открытия</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => setOpenShiftFiles(fileList(event))}
                      className="mt-1 w-full text-xs text-white file:mr-3 file:rounded-[8px] file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-deep"
                    />
                    {openShiftFiles.length > 0 && <span className="mt-1 block font-mono text-[11px] text-white">{openShiftFiles.length} фото</span>}
                  </label>
                  <button type="button" disabled={busy === 'shift'} onClick={doOpenShift} className="mt-3.5 w-full rounded-[11px] bg-white py-3 text-center text-sm font-bold text-deep disabled:opacity-60">
                    {busy === 'shift' ? '…' : 'Открыть смену'}
                  </button>
                </div>
                </>
              )}

              <div className="mb-4 grid grid-cols-2 gap-2.5" data-testid="staff-primary-actions">
                {staffTabAllowed(session.role, 'orders') && (
                  <Action icon="📦" label="Заказы" badge="Новые заказы" onClick={() => setTab('orders')} />
                )}
                <ActionLink icon="＋" label="Добавить товар" badge="Каталог" href="/admin/products" />
                <Action icon="♻️" label="Скупка Б/У" badge="По регламенту" onClick={() => setTab('buyback')} />
                {/* Соседние бейджи — подписи, а не счётчики. Здесь стояло «2 активных»:
                    число не считалось ниоткуда и не менялось никогда. */}
                <Action icon="📊" label="Задачи и KPI" badge="Мои задачи" onClick={() => setTab('tasks')} />
              </div>

              <div className="mb-4 flex gap-2 overflow-x-auto" aria-label="Дополнительные операции">
                <CompactAction label="B2B · Опт" onClick={() => setTab('b2b')} />
                <CompactAction label="Защита" onClick={() => setTab('protection')} />
                {(canCreateDebt(session.role) || canPayDebt(session.role)) && (
                  <CompactAction label="Долги" onClick={() => setTab('debts')} />
                )}
                {canIssueGiftCard(session.role) && (
                  <CompactAction label="Карты" onClick={() => setTab('cards')} />
                )}
                <CompactAction label="Моя неделя" onClick={() => setTab('hr')} />
                <Link href="/pos" className="flex-shrink-0 rounded-chip border border-[#2E2822] bg-[#221E19] px-3 py-2 text-xs font-semibold text-[#D8CFC6]">POS · Касса</Link>
              </div>

              <div className="erp3-glass rounded-[16px] p-4">
                <div className="mb-2 font-mono text-xs text-lime">🤖 ЗАДАЧА ОТ AI</div>
                <div className="text-[14px] leading-relaxed">Мало продаж аксессуаров сегодня. Предлагай чехол/зарядку к каждому телефону — цель +5 к чеку.</div>
                <button type="button" onClick={() => setTab('tasks')} className="erp3-coral-action mt-3 w-full rounded-[10px] py-2.5 text-[13px] font-bold text-white">К задачам</button>
              </div>
            </>
          )}

          {tab === 'orders' && (
            <div className="pt-1">
              <SectionTitle title="Заказы" onBack={() => setTab('home')} />
              {orders === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
              {orders && orders.length === 0 && <p className="py-8 text-center text-sm text-[#8A7F76]">Очередь пуста</p>}
              {(orders ?? []).map((o) => (
                <div key={o.id} className="mb-2.5 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">#{o.id.slice(-6)}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] ${o.status === 'created' ? 'bg-lime/15 text-lime' : 'bg-warn/15 text-warn'}`}>
                      {o.status === 'created' ? 'Новый' : 'Сборка'}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13px] text-[#A79C92]">
                    {o.items.reduce((s, i) => s + i.qty, 0)} тов. · {som(o.total)} · {o.channel} · {o.fulfillmentType ?? 'pickup'}
                  </div>
                  {(o.pickupPoint || o.deliveryAddress || o.pickupCode) && (
                    <div className="mt-2 rounded-[10px] bg-[#16130F] px-3 py-2 text-[12px] text-[#A79C92]">
                      <span>{o.pickupPoint ?? o.deliveryAddress}</span>
                      {o.pickupCode && <span className="ml-2 font-mono text-lime">{o.pickupCode}</span>}
                    </div>
                  )}
                  <button type="button" disabled={busy === o.id} onClick={() => orderAction(o)} className="erp3-coral-action mt-2.5 w-full rounded-[9px] py-2 text-center text-xs font-bold text-white disabled:opacity-60">
                    {busy === o.id ? '…' : o.status === 'created' ? 'Собрать · назначить IMEI' : 'В сборку'}
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {canPrintDocuments(session.role) && (
                      <button type="button" disabled={busy === `invoice-${o.id}`} onClick={() => printInvoice(o)} className="rounded-[9px] border border-[#2E2822] bg-[#16130F] py-2 text-center text-xs font-semibold text-[#D8CFC6] hover:border-lime disabled:opacity-60">
                        {busy === `invoice-${o.id}` ? '…' : '⎙ Накладная'}
                      </button>
                    )}
                    {canPrintReceipts(session.role) && (
                      <button type="button" disabled={busy === `receipt-${o.id}`} onClick={() => printReceipt(o)} className="rounded-[9px] border border-[#2E2822] bg-[#16130F] py-2 text-center text-xs font-semibold text-[#D8CFC6] hover:border-lime disabled:opacity-60">
                        {busy === `receipt-${o.id}` ? '…' : '⎙ Чек'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'tasks' && (
            <div className="pt-1">
              <SectionTitle title="Задачи и KPI" onBack={() => setTab('home')} />
              <div className="erp3-glass mb-3.5 rounded-[16px] p-4">
                <div className="mb-2 flex justify-between text-[13px]"><span className="text-[#D8CFC6]">KPI месяца</span><span className="font-mono text-lime">92%</span></div>
                <div className="h-2 overflow-hidden rounded-chip bg-[#16130F]"><div className="h-full w-[92%] bg-gradient-to-r from-[#C6FF3D] to-[#8FD40F]" /></div>
                <div className="mt-2 text-[11px] text-[#8A7F76]">До бонуса 15 000 сом осталось 8%</div>
              </div>
              {tasks === null && <p className="py-8 text-center text-sm text-[#8A7F76]">Загрузка…</p>}
              {taskError && (
                <div className="py-7 text-center">
                  <p className="text-sm text-[#D69A83]">{taskError}</p>
                  <button type="button" onClick={loadTasks} className="erp3-coral-action mt-3 rounded-[9px] px-4 py-2 text-xs font-bold text-white">
                    Повторить
                  </button>
                </div>
              )}
              {!taskError && tasks?.length === 0 && <p className="py-8 text-center text-sm text-[#8A7F76]">Назначенных задач нет</p>}
              {(tasks ?? []).map((task) => (
                <div key={task.id} className="mb-2.5 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={busy === task.id || task.status === 'completed'}
                      onClick={() => taskAction(task)}
                      aria-label={`${task.status === 'completed' ? 'Выполнено' : task.status === 'open' ? 'Начать' : 'Завершить'}: ${task.title}`}
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs ${task.status === 'completed' ? 'border-lime bg-lime text-lime-ink' : 'border-[#554C44] text-transparent'}`}
                    >✓</button>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13px] font-semibold ${task.status === 'completed' ? 'text-[#6E645C] line-through' : 'text-[#D8CFC6]'}`}>{task.title}</div>
                      {task.description && <div className="mt-1 text-[11px] text-[#8A7F76]">{task.description}</div>}
                      <div className="mt-2 flex gap-2 font-mono text-[10px] text-[#8A7F76]"><span>{task.status}</span><span>{task.priority}</span>{task.dueAt && <span>до {task.dueAt.slice(0, 10)}</span>}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'b2b' && (
            <div className="pt-1">
              <SectionTitle title="B2B · Оптовые заявки" onBack={() => setTab('home')} />
              {b2bQuotes === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
              {b2bQuotes && b2bQuotes.length === 0 && <p className="py-8 text-center text-sm text-[#8A7F76]">Заявок пока нет</p>}
              {(b2bQuotes ?? []).map((quote) => {
                const canManage = ['senior_seller', 'admin', 'owner'].includes(session.role);
                return (
                  <article key={quote.id} className="mb-2.5 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{quote.profile?.companyName ?? `Клиент ${quote.customerId.slice(-6)}`}</span>
                      <span className="rounded-md bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-lime">{quote.status}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#8A7F76]">ИНН {quote.profile?.taxId ?? '—'} · {quote.profile?.contactName ?? '—'}</div>
                    <div className="mt-2 text-[13px] text-[#D8CFC6]">{quote.items.map((item) => `${item.name} × ${item.qty}`).join(', ')}</div>
                    <div className="mt-1 font-display text-base font-extrabold">{som(quote.listTotal)}</div>
                    {canManage && quote.status === 'requested' && (
                      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                        <button type="button" disabled={busy === quote.id} onClick={() => quoteAction(quote, 'reviewing')} className="erp3-coral-action rounded-[9px] py-2 text-xs font-bold text-white">В работу</button>
                        <button type="button" disabled={busy === quote.id} onClick={() => quoteAction(quote, 'rejected')} className="rounded-[9px] border border-[#49342D] px-3 text-xs text-[#FF8A7A]">Отклонить</button>
                      </div>
                    )}
                    {canManage && quote.status === 'reviewing' && (
                      <div className="mt-3 flex gap-2">
                        <input aria-label="Сумма КП" type="number" value={quoteTotals[quote.id] ?? ''} onChange={(event) => setQuoteTotals((current) => ({ ...current, [quote.id]: event.target.value }))} className="min-w-0 flex-1 rounded-[9px] border border-[#2E2822] bg-[#16130F] px-3 py-2 font-mono text-xs outline-none focus:border-lime" />
                        <button type="button" disabled={busy === quote.id || !Number(quoteTotals[quote.id])} onClick={() => quoteAction(quote, 'quoted')} className="erp3-coral-action rounded-[9px] px-3 text-xs font-bold text-white disabled:opacity-50">Отправить КП</button>
                      </div>
                    )}
                    {quote.quotedTotal !== null && <div className="mt-2 text-xs text-lime">КП {som(quote.quotedTotal)}</div>}
                  </article>
                );
              })}
            </div>
          )}

          {tab === 'protection' && (
            <div className="pt-1">
              <SectionTitle title="Защита устройств" onBack={() => setTab('home')} />
              {protection === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
              {protection && protection.length === 0 && <p className="py-8 text-center text-sm text-[#8A7F76]">Заявок пока нет</p>}
              {(protection ?? []).map((policy) => {
                const canManage = ['senior_seller', 'admin', 'owner'].includes(session.role);
                return (
                  <article key={policy.id} className="mb-2.5 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{policy.productName}</span>
                      <span className="rounded-md bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-lime">{policy.status}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-[#8A7F76]">{policy.imei}</div>
                    <div className="mt-2 text-[12px] text-[#A79C92]">{policy.planType} · {policy.coverageMonths} мес. · устройство {som(policy.deviceValue)}</div>
                    {canManage && policy.status === 'requested' && (
                      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                        <button type="button" disabled={busy === policy.id} onClick={() => protectionAction(policy, 'reviewing')} className="erp3-coral-action rounded-[9px] py-2 text-xs font-bold text-white">В работу</button>
                        <button type="button" disabled={busy === policy.id} onClick={() => protectionAction(policy, 'rejected')} className="rounded-[9px] border border-[#49342D] px-3 text-xs text-[#FF8A7A]">Отклонить</button>
                      </div>
                    )}
                    {canManage && policy.status === 'reviewing' && (
                      <div className="mt-3 flex gap-2">
                        <input aria-label="Страховая премия" type="number" value={protectionPremiums[policy.id] ?? ''} onChange={(event) => setProtectionPremiums((current) => ({ ...current, [policy.id]: event.target.value }))} className="min-w-0 flex-1 rounded-[9px] border border-[#2E2822] bg-[#16130F] px-3 py-2 font-mono text-xs outline-none focus:border-lime" />
                        <button type="button" disabled={busy === policy.id || !Number(protectionPremiums[policy.id])} onClick={() => protectionAction(policy, 'offered')} className="erp3-coral-action rounded-[9px] px-3 text-xs font-bold text-white disabled:opacity-50">Предложить</button>
                      </div>
                    )}
                    {policy.premium !== null && <div className="mt-2 text-xs text-lime">Премия {som(policy.premium)}</div>}
                  </article>
                );
              })}
            </div>
          )}

          {tab === 'buyback' && (
            <div className="pt-1">
              <SectionTitle title="Скупка Б/У" onBack={() => setTab('home')} />
              <p className="mb-3.5 text-[13px] leading-relaxed text-[#A79C92]">Проверьте по регламенту, затем оформите договор.</p>
              {BUYBACK.map((b, i) => (
                <Check key={i} label={b} done={buyback[i]} onClick={() => setBuyback((a) => a.map((v, j) => (j === i ? !v : v)))} />
              ))}
              <form onSubmit={submitBuyback} className="mt-4 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
                <div className="mb-3 font-display text-[15px] font-bold">Договор скупки</div>
                <Field
                  label="Телефон"
                  value={buybackForm.phone}
                  onChange={(phone) => setBuybackForm((f) => ({ ...f, phone }))}
                  inputMode="tel"
                />
                <Field
                  label="Имя"
                  value={buybackForm.name}
                  onChange={(name) => setBuybackForm((f) => ({ ...f, name }))}
                />
                <Field
                  label="Модель"
                  value={buybackForm.model}
                  onChange={(model) => setBuybackForm((f) => ({ ...f, model }))}
                  required
                />
                <Field
                  label="IMEI"
                  value={buybackForm.imei}
                  onChange={(imei) => setBuybackForm((f) => ({ ...f, imei }))}
                />
                <div className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#8A7F76]">Грейд</span>
                  <select
                    value={buybackForm.grade}
                    onChange={(e) => setBuybackForm((f) => ({ ...f, grade: e.target.value as TradeInGrade }))}
                    className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <Field
                  label="Цена"
                  value={buybackForm.price}
                  onChange={(price) => setBuybackForm((f) => ({ ...f, price }))}
                  inputMode="numeric"
                  required
                />
                <Field
                  label="Паспорт"
                  value={buybackForm.passport}
                  onChange={(passport) => setBuybackForm((f) => ({ ...f, passport }))}
                  required
                />
                <button
                  type="submit"
                  disabled={busy === 'buyback'}
                  className="erp3-coral-action mt-2 w-full rounded-[11px] py-3 text-center text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy === 'buyback' ? '…' : 'Оформить договор'}
                </button>
                {tradeIn && (
                  <div className="mt-3 rounded-[12px] border border-lime/20 bg-lime/10 p-3">
                    <div className="font-mono text-[12px] text-lime">{tradeIn.contractId}</div>
                    <div className="mt-1 text-[12px] text-[#D8CFC6]">
                      {tradeIn.model} · Grade {tradeIn.grade} · {som(tradeIn.price)}
                    </div>
                    {tradeIn.imei && (
                      <div className="mt-1 font-mono text-[11px] text-[#8A7F76]">IMEI {tradeIn.imei}</div>
                    )}
                    <div className="mt-1 text-[11px] text-[#8A7F76]">
                      Паспорт {tradeIn.sellerPassportMasked}
                    </div>
                    <button
                      type="button"
                      disabled={busy === 'buyback-contract'}
                      onClick={downloadContract}
                      className="mt-2.5 w-full rounded-[9px] border border-lime/30 bg-lime/15 py-2 text-center text-xs font-bold text-lime disabled:opacity-60"
                    >
                      {busy === 'buyback-contract' ? '…' : 'Скачать договор (PDF)'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {tab === 'debts' && (
            <div className="pt-1">
              <SectionTitle title="Долги и рассрочка" onBack={() => setTab('home')} />
              <DebtsDesk accessToken={session.accessToken} role={session.role} flash={flash} />
            </div>
          )}

          {tab === 'cards' && (
            <div className="pt-1">
              <SectionTitle title="Подарочные карты" onBack={() => setTab('home')} />
              <GiftCardIssue accessToken={session.accessToken} role={session.role} flash={flash} />
            </div>
          )}

          {tab === 'hr' && (
            <div className="pt-1">
              <SectionTitle title="Моя неделя" onBack={() => setTab('home')} />
              {hrError && (
                <div className="py-7 text-center">
                  <p className="text-sm text-[#D69A83]">{hrError}</p>
                  <button type="button" onClick={loadHr} className="erp3-coral-action mt-3 rounded-[9px] px-4 py-2 text-xs font-bold text-white">
                    Повторить
                  </button>
                </div>
              )}
              {!hrError && hrWeek === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
              {hrWeek && (
                <>
                  {hrWeek.schedules.length === 0 && <p className="py-4 text-center text-sm text-[#8A7F76]">Смен на этой неделе нет</p>}
                  {hrWeek.schedules.map((schedule) => (
                    <div key={schedule.id} className="mb-2.5 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{schedule.shiftDate.slice(0, 10)}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[11px] ${schedule.attendance?.checkedOutAt ? 'bg-lime/15 text-lime' : schedule.attendance ? 'bg-warn/15 text-warn' : 'bg-[#16130F] text-[#8A7F76]'}`}>
                          {schedule.attendance?.checkedOutAt ? 'Отработана' : schedule.attendance ? 'На смене' : 'План'}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[13px] text-[#A79C92]">{clock(schedule.startsAt)}–{clock(schedule.endsAt)} · {schedule.point}</div>
                      {schedule.attendance && (
                        <div className="mt-1 font-mono text-[11px] text-[#8A7F76]">
                          приход {clock(schedule.attendance.checkedInAt)}{schedule.attendance.checkedOutAt ? ` · уход ${clock(schedule.attendance.checkedOutAt)}` : ''}
                        </div>
                      )}
                      {!schedule.cancelledAt && !schedule.attendance && (
                        <button type="button" disabled={busy === schedule.id} onClick={() => attendanceAction(schedule, 'open')} className="erp3-coral-action mt-2.5 w-full rounded-[9px] py-2 text-center text-xs font-bold text-white disabled:opacity-60">
                          {busy === schedule.id ? '…' : 'Отметить приход'}
                        </button>
                      )}
                      {schedule.attendance && !schedule.attendance.checkedOutAt && (
                        <button type="button" disabled={busy === schedule.id} onClick={() => attendanceAction(schedule, 'close')} className="erp3-coral-action mt-2.5 w-full rounded-[9px] py-2 text-center text-xs font-bold text-white disabled:opacity-60">
                          {busy === schedule.id ? '…' : 'Отметить уход'}
                        </button>
                      )}
                    </div>
                  ))}

                  <form onSubmit={submitAbsence} className="mt-4 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
                    <div className="mb-3 font-display text-[15px] font-bold">Запрос отсутствия</div>
                    <div className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
                      <span className="text-[12px] font-semibold text-[#8A7F76]">Тип</span>
                      <select
                        aria-label="Тип отсутствия"
                        value={absenceForm.type}
                        onChange={(e) => setAbsenceForm((f) => ({ ...f, type: e.target.value as HrAbsenceType }))}
                        className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
                      >
                        {Object.entries(ABSENCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <Field
                      label="С"
                      value={absenceForm.startsOn}
                      onChange={(startsOn) => setAbsenceForm((f) => ({ ...f, startsOn }))}
                      type="date"
                      required
                    />
                    <Field
                      label="По"
                      value={absenceForm.endsOn}
                      onChange={(endsOn) => setAbsenceForm((f) => ({ ...f, endsOn }))}
                      type="date"
                      required
                    />
                    <Field
                      label="Причина"
                      value={absenceForm.reason}
                      onChange={(reason) => setAbsenceForm((f) => ({ ...f, reason }))}
                    />
                    <button
                      type="submit"
                      disabled={busy === 'absence'}
                      className="erp3-coral-action mt-2 w-full rounded-[11px] py-3 text-center text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy === 'absence' ? '…' : 'Отправить запрос'}
                    </button>
                  </form>

                  {hrWeek.absences.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 font-display text-[15px] font-bold">Мои отсутствия</div>
                      {hrWeek.absences.map((absence) => (
                        <div key={absence.id} className="mb-2 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold">{ABSENCE_LABEL[absence.type] ?? absence.type}</span>
                            <span className="rounded-md bg-[#16130F] px-2 py-0.5 text-[11px] text-[#A79C92]">{ABSENCE_STATUS_LABEL[absence.status] ?? absence.status}</span>
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-[#8A7F76]">{absence.startsOn.slice(0, 10)} → {absence.endsOn.slice(0, 10)}</div>
                          {absence.reason && <div className="mt-1 text-[11px] text-[#8A7F76]">{absence.reason}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {toast && (
          <div className="absolute bottom-24 left-4 right-4 rounded-[12px] bg-lime px-4 py-3 text-center text-[13px] font-semibold text-lime-ink">{toast}</div>
        )}

        {/* bottom nav */}
        <div className="flex flex-shrink-0 border-t border-[#2E2822] bg-[#1A1611] px-1.5 pb-6 pt-2">
          {NAV.filter((n) => n.id !== 'hr' && staffTabAllowed(session.role, n.id)).map((n) => (
            <button key={n.id} type="button" onClick={() => setTab(n.id)} className="flex-1 text-center">
              <div className="text-xl">{n.icon}</div>
              <div className={`mt-0.5 text-[10px] ${tab === n.id ? 'font-bold text-lime' : 'text-[#8A7F76]'}`}>{n.label}</div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div>
      <div className="font-display text-lg font-extrabold tabular" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="text-[11px] text-[#8A7F76]">{label}</div>
    </div>
  );
}
function Action({ icon, label, badge, onClick }: { icon: string; label: string; badge?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4 text-left">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-[13px] font-semibold">{label}</div>
      {badge && <div className="mt-0.5 text-[11px] text-lime">{badge}</div>}
    </button>
  );
}
function ActionLink({ icon, label, badge, href }: { icon: string; label: string; badge?: string; href: string }) {
  return (
    <Link href={href} className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-[13px] font-semibold">{label}</div>
      {badge && <div className="mt-0.5 text-[11px] text-lime">{badge}</div>}
    </Link>
  );
}
function CompactAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex-shrink-0 rounded-chip border border-[#2E2822] bg-[#221E19] px-3 py-2 text-xs font-semibold text-[#D8CFC6]">{label}</button>;
}
function SectionTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <button type="button" onClick={onBack} aria-label="Назад на главную" className="text-xl text-white">←</button>
      <h2 className="font-display text-[19px] font-bold">{title}</h2>
    </div>
  );
}
function Check({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-2 flex w-full items-center gap-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-left">
      <span className={`grid h-5.5 w-5.5 flex-shrink-0 place-items-center rounded-[7px] border-2 text-xs ${done ? 'border-lime bg-lime text-lime-ink' : 'border-[#3A342E]'}`} style={{ height: 22, width: 22 }}>{done ? '✓' : ''}</span>
      <span className={`text-[13px] ${done ? 'text-[#6E645C] line-through' : 'text-[#D8CFC6]'}`}>{label}</span>
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  inputMode,
  required,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
      <span className="text-[12px] font-semibold text-[#8A7F76]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        required={required}
        type={type}
        className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
      />
    </label>
  );
}
