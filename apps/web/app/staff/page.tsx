'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, HTMLAttributes } from 'react';
import { closeShift, currentShift, fetchShift, openShift, type Shift } from '@/lib/staff';
import {
  createCustomer,
  createTradeIn,
  fetchOrdersByStatus,
  fulfillOrder,
  transitionOrder,
  uploadEvidenceImages,
  type QueueOrder,
  type TradeIn,
  type TradeInGrade,
} from '@/lib/api';
import { som } from '@/lib/format';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

const POINT = 'BISHKEK-1';
const SHOP = 'AliStore Центр';

type Tab = 'home' | 'orders' | 'tasks' | 'buyback';
const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'orders', icon: '📦', label: 'Заказы' },
  { id: 'tasks', icon: '📊', label: 'KPI' },
  { id: 'buyback', icon: '♻️', label: 'Скупка' },
];
const TASKS = ['Предлагать аксессуары к телефонам', 'Обновить ценники на витрине', 'Проверить остатки Apple Watch'];
const BUYBACK = ['Проверить IMEI по базе краденого', 'Осмотреть состояние, присвоить грейд', 'Сделать фото (4 ракурса)', 'Внести данные клиента и паспорт'];

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>('home');
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [tasks, setTasks] = useState<boolean[]>(TASKS.map(() => false));
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

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  const loadShift = useCallback(async () => {
    if (!session) return;
    const s = await currentShift(session.accessToken);
    setShift(s ? await fetchShift(s.id, session.accessToken) : null);
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
  useEffect(() => { if (tab === 'orders' && session) loadOrders(); }, [tab, loadOrders, session]);

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(''), 1600); }
  function fileList(event: ChangeEvent<HTMLInputElement>) {
    return Array.from(event.target.files ?? []);
  }

  async function doOpenShift() {
    if (!session) return;
    setBusy('shift');
    try {
      const opened = await openShift({ staffId: session.staffId, point: POINT, openCash: 0 }, session.accessToken);
      const evidence = openShiftFiles.length
        ? await uploadEvidenceImages({
          files: openShiftFiles,
          entityType: 'shift',
          entityId: opened.id,
          label: 'shift_open_photo',
          actor: session.staffId,
        })
        : [];
      setOpenShiftFiles([]);
      await loadShift();
      flash(`Смена открыта · фото ${evidence.length}`);
    }
    catch { flash('Ошибка'); } finally { setBusy(null); }
  }
  async function doCloseShift() {
    if (!shift || !session) return;
    const expected = shift.openCash + (shift.payments ?? []).filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    setBusy('shift');
    try {
      await closeShift(shift.id, expected, session.accessToken);
      const evidence = closeShiftFiles.length
        ? await uploadEvidenceImages({
          files: closeShiftFiles,
          entityType: 'shift',
          entityId: shift.id,
          label: 'shift_close_photo',
          actor: session.staffId,
        })
        : [];
      setCloseShiftFiles([]);
      await loadShift();
      flash(`Смена закрыта · фото ${evidence.length}`);
    }
    catch { flash('Ошибка закрытия'); } finally { setBusy(null); }
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
        actor: session.staffId,
      }, session.accessToken);
      setTradeIn(result);
      setBuyback(BUYBACK.map(() => true));
      flash('Договор оформлен');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка скупки');
    } finally {
      setBusy(null);
    }
  }

  const cashSales = (shift?.payments ?? []).filter((p) => p.method === 'cash');
  const revenue = (shift?.payments ?? []).reduce((s, p) => s + p.amount, 0);

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
    <div className="fixed inset-0 z-50 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[420px] flex-col bg-[#16130F] text-white">
        {/* header */}
        <div className="flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-coral to-deep font-display text-lg font-extrabold">
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
              clearStaffSession();
              setSession(null);
              setShift(null);
              setOrders(null);
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
                    <button type="button" disabled={busy === 'shift'} onClick={doCloseShift} className="text-xs text-[#FF8A7A]">Закрыть</button>
                  </div>
                  <div className="mt-3.5 grid grid-cols-3 gap-2.5">
                    <Stat value={String(cashSales.length + (shift.payments?.length ?? 0) - cashSales.length)} label="платежей" />
                    <Stat value={som(revenue)} label="выручка" />
                    <Stat value={som(shift.openCash)} label="в кассе" accent="#C6FF3D" />
                  </div>
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
                </div>
              ) : (
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
              )}

              <div className="mb-4 grid grid-cols-2 gap-2.5">
                <Action icon="📦" label="Заказы" onClick={() => setTab('orders')} />
                <Action icon="📊" label="Задачи и KPI" onClick={() => setTab('tasks')} />
                <Action icon="♻️" label="Скупка Б/У" onClick={() => setTab('buyback')} />
                <ActionLink icon="🖥" label="POS · Касса" href="/pos" />
              </div>

              <div className="rounded-[16px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#221E19] p-4">
                <div className="mb-2 font-mono text-xs text-lime">🤖 ЗАДАЧА ОТ AI</div>
                <div className="text-[14px] leading-relaxed">Мало продаж аксессуаров сегодня. Предлагай чехол/зарядку к каждому телефону — цель +5 к чеку.</div>
              </div>
            </>
          )}

          {tab === 'orders' && (
            <div className="pt-1">
              <h2 className="mb-3 font-display text-lg font-bold">Заказы</h2>
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
                  <button type="button" disabled={busy === o.id} onClick={() => orderAction(o)} className="mt-2.5 w-full rounded-[9px] bg-lime py-2 text-center text-xs font-bold text-lime-ink disabled:opacity-60">
                    {busy === o.id ? '…' : o.status === 'created' ? 'Собрать · назначить IMEI' : 'В сборку'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'tasks' && (
            <div className="pt-1">
              <h2 className="mb-3 font-display text-lg font-bold">Задачи и KPI</h2>
              <div className="mb-3.5 rounded-[16px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#221E19] p-4">
                <div className="mb-2 flex justify-between text-[13px]"><span className="text-[#D8CFC6]">KPI месяца</span><span className="font-mono text-lime">92%</span></div>
                <div className="h-2 overflow-hidden rounded-chip bg-[#16130F]"><div className="h-full w-[92%] bg-gradient-to-r from-[#C6FF3D] to-[#8FD40F]" /></div>
                <div className="mt-2 text-[11px] text-[#8A7F76]">До бонуса 15 000 сом осталось 8%</div>
              </div>
              {TASKS.map((t, i) => (
                <Check key={i} label={t} done={tasks[i]} onClick={() => setTasks((a) => a.map((v, j) => (j === i ? !v : v)))} />
              ))}
            </div>
          )}

          {tab === 'buyback' && (
            <div className="pt-1">
              <h2 className="mb-3 font-display text-lg font-bold">Скупка Б/У</h2>
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
                  className="mt-2 w-full rounded-[11px] bg-lime py-3 text-center text-sm font-bold text-lime-ink disabled:opacity-60"
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
                  </div>
                )}
              </form>
            </div>
          )}
        </div>

        {toast && (
          <div className="absolute bottom-24 left-4 right-4 rounded-[12px] bg-lime px-4 py-3 text-center text-[13px] font-semibold text-lime-ink">{toast}</div>
        )}

        {/* bottom nav */}
        <div className="flex flex-shrink-0 border-t border-[#2E2822] bg-[#1A1611] px-1.5 pb-6 pt-2">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => setTab(n.id)} className="flex-1 text-center">
              <div className="text-xl">{n.icon}</div>
              <div className={`mt-0.5 text-[10px] ${tab === n.id ? 'font-bold text-lime' : 'text-[#8A7F76]'}`}>{n.label}</div>
            </button>
          ))}
        </div>
      </div>
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
function Action({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4 text-left">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-[13px] font-semibold">{label}</div>
    </button>
  );
}
function ActionLink({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-[13px] font-semibold">{label}</div>
    </Link>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  required?: boolean;
}) {
  return (
    <label className="mb-2 grid grid-cols-[86px_1fr] items-center gap-2">
      <span className="text-[12px] font-semibold text-[#8A7F76]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        required={required}
        className="rounded-[10px] border border-[#2E2822] bg-[#16130F] px-3 py-2.5 text-[13px] text-white outline-none focus:border-lime"
      />
    </label>
  );
}
