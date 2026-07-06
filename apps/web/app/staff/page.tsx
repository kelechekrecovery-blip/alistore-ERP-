'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { closeShift, currentShift, fetchShift, openShift, type Shift } from '@/lib/staff';
import { fetchOrdersByStatus, fulfillOrder, transitionOrder, type QueueOrder } from '@/lib/api';
import { som } from '@/lib/format';

const STAFF = { staffId: 'pos_azizbek', point: 'BISHKEK-1', name: 'Азизбек', role: 'Продавец · AliStore Центр' };

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
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const loadShift = useCallback(async () => {
    const s = await currentShift(STAFF.staffId);
    setShift(s ? await fetchShift(s.id) : null);
  }, []);
  useEffect(() => { loadShift(); }, [loadShift]);

  const loadOrders = useCallback(async () => {
    setOrders(null);
    const [a, b] = await Promise.all([fetchOrdersByStatus('created'), fetchOrdersByStatus('reserved')]);
    setOrders([...a, ...b]);
  }, []);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(''), 1600); }

  async function doOpenShift() {
    setBusy('shift');
    try { await openShift({ staffId: STAFF.staffId, point: STAFF.point, openCash: 0 }); await loadShift(); flash('Смена открыта'); }
    catch { flash('Ошибка'); } finally { setBusy(null); }
  }
  async function doCloseShift() {
    if (!shift) return;
    const expected = shift.openCash + (shift.payments ?? []).filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    setBusy('shift');
    try { await closeShift(shift.id, expected); await loadShift(); flash('Смена закрыта'); }
    catch { flash('Ошибка закрытия'); } finally { setBusy(null); }
  }
  async function orderAction(o: QueueOrder) {
    setBusy(o.id);
    try {
      if (o.status === 'created') { await fulfillOrder(o.id); flash('IMEI назначены'); }
      else { await transitionOrder(o.id, 'picking'); flash('В сборке'); }
      loadOrders();
    } catch (e) { flash(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(null); }
  }

  const cashSales = (shift?.payments ?? []).filter((p) => p.method === 'cash');
  const revenue = (shift?.payments ?? []).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[420px] flex-col bg-[#16130F] text-white">
        {/* header */}
        <div className="flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-coral to-deep font-display text-lg font-extrabold">Аз</span>
          <div className="flex-1">
            <div className="font-display text-base font-bold">{STAFF.name}</div>
            <div className="text-xs text-[#8A7F76]">{STAFF.role}</div>
          </div>
          <span className={`rounded-chip px-3 py-1.5 text-xs font-semibold ${shift ? 'bg-lime/10 text-lime' : 'bg-[#221E19] text-[#8A7F76]'}`}>
            {shift ? '● на смене' : '○ вне смены'}
          </span>
          <Link href="/" className="text-[#8A7F76]">✕</Link>
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
                </div>
              ) : (
                <div className="mb-4 rounded-[18px] bg-gradient-to-br from-coral to-deep p-5">
                  <div className="font-display text-[17px] font-bold">Смена не открыта</div>
                  <div className="mt-1 text-[13px] leading-snug text-[#FFE0D5]">Откройте смену, чтобы принимать оплату и заказы.</div>
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
                  <div className="mt-1.5 text-[13px] text-[#A79C92]">{o.items.reduce((s, i) => s + i.qty, 0)} тов. · {som(o.total)} · {o.channel}</div>
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
