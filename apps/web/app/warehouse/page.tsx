'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchOrdersByStatus,
  fetchUnitLabel,
  fulfillOrder,
  printServerSvg,
  transitionOrder,
  type QueueOrder,
} from '@/lib/api';
import { som } from '@/lib/format';
import { WarehouseOps } from '@/components/WarehouseOps';
import { ConsignmentOps } from '@/components/ConsignmentOps';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import {
  clearStaffSession,
  loadStaffSession,
  type StaffSession,
} from '@/lib/staff-session';

interface Stage {
  status: string;
  label: string;
  action: string;
  kind: 'fulfill' | 'transition';
  to?: string;
}

const STAGES: Stage[] = [
  { status: 'created', label: 'Новые', action: 'Собрать · назначить IMEI', kind: 'fulfill' },
  { status: 'reserved', label: 'Собрано', action: 'В сборку', kind: 'transition', to: 'picking' },
  { status: 'picking', label: 'В сборке', action: 'Упаковано', kind: 'transition', to: 'packed' },
  { status: 'packed', label: 'Упаковано', action: 'Готов к выдаче', kind: 'transition', to: 'ready_for_pickup' },
  { status: 'ready_for_pickup', label: 'К выдаче', action: 'Завершить', kind: 'transition', to: 'completed' },
];

export default function WarehousePage() {
  const [stage, setStage] = useState<Stage>(STAGES[0]);
  const [orders, setOrders] = useState<QueueOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    setSession(loadStaffSession());
  }, []);

  const load = useCallback((s: Stage) => {
    if (!session) return;
    setOrders(null);
    fetchOrdersByStatus(s.status, session.accessToken)
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [session]);

  useEffect(() => {
    if (session) load(stage);
  }, [stage, load, session]);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function act(order: QueueOrder) {
    if (!session) return;
    setBusy(order.id);
    try {
      if (stage.kind === 'fulfill') {
        const res = await fulfillOrder(order.id, session.accessToken);
        flash(`Назначено IMEI: ${res.assigned.length} · заказ #${order.id.slice(-6)}`);
      } else if (stage.to) {
        await transitionOrder(order.id, stage.to, session.accessToken);
        flash(`Заказ #${order.id.slice(-6)} → ${stage.to}`);
      }
      load(stage);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  }

  async function printLabel(imei: string) {
    if (!session) return;
    setBusy(`label-${imei}`);
    try {
      const label = await fetchUnitLabel(imei, session.accessToken);
      printServerSvg(label.svg, `IMEI ${label.imei}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка этикетки');
    } finally {
      setBusy(null);
    }
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4">
        <Link
          href="/"
          className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          ⌂ Выйти
        </Link>
        <StaffSessionLogin
          title="Склад · вход"
          caption="Войдите, чтобы открыть складские операции."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E0C0A]">
      <header className="flex items-center gap-4 border-b border-[#2E2822] bg-[#16130F]/90 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-lime font-display text-lg font-extrabold text-lime-ink">
          W
        </span>
        <div>
          <div className="font-display text-lg font-bold text-white">Склад · Сборка заказов</div>
          <div className="text-xs text-[#8A7F76]">Назначение IMEI и движение по статусам · {session.username}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearStaffSession();
            setSession(null);
            setOrders(null);
          }}
          className="ml-auto rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#8A7F76] hover:border-[#3A342E]"
        >
          Выйти staff
        </button>
        <Link
          href="/"
          className="rounded-chip border border-[#2E2822] px-4 py-2 text-sm font-medium text-[#8A7F76] hover:border-[#2E2822]"
        >
          ⌂ Выйти
        </Link>
      </header>

      <div className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-[#2E2822] bg-[#1A1611] px-6 py-3">
        {STAGES.map((s) => (
          <button
            key={s.status}
            type="button"
            onClick={() => setStage(s)}
            className={`flex-shrink-0 rounded-chip px-4 py-2 text-sm font-semibold transition ${
              stage.status === s.status
                ? 'bg-lime text-lime-ink'
                : 'border border-[#2E2822] bg-[#1A1611] text-[#8A7F76] hover:border-[#2E2822]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <WarehouseOps accessToken={session.accessToken} actor={session.staffId} />
          <ConsignmentOps accessToken={session.accessToken} role={session.role} />
          {orders === null && <p className="font-mono text-sm text-[#8A7F76]">Загрузка…</p>}
          {orders && orders.length === 0 && (
            <div className="rounded-card border border-dashed border-[#2E2822] bg-[#1A1611] px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-white">Пусто</p>
              <p className="mt-1 text-sm text-[#8A7F76]">Нет заказов в статусе «{stage.label}».</p>
            </div>
          )}
          {orders && orders.length > 0 && (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => {
                const count = o.items.reduce((s, i) => s + i.qty, 0);
                const imeis = o.items.map((i) => i.imei).filter(Boolean) as string[];
                return (
                  <li key={o.id} className="rounded-card border border-[#2E2822] bg-[#1A1611] p-5 ">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-white">#{o.id.slice(-8)}</span>
                      <span className="rounded-chip bg-[#221E19] px-2.5 py-0.5 text-xs font-semibold text-lime">
                        {o.channel}
                      </span>
                      <span className="rounded-chip bg-[#221E19] px-2.5 py-0.5 text-xs font-semibold text-[#D8CFC6]">
                        {o.fulfillmentType ?? 'pickup'}
                      </span>
                      {o.customer && (
                        <span className="font-mono text-xs text-[#8A7F76]">{o.customer.phone}</span>
                      )}
                      <span className="text-sm text-[#8A7F76]">
                        {count} {count === 1 ? 'товар' : 'товара/ов'}
                      </span>
                      <span className="ml-auto font-mono font-bold tabular text-white">
                        {som(o.total)}
                      </span>
                    </div>

                    {(o.pickupPoint || o.deliveryAddress || o.pickupCode) && (
                      <div className="mt-3 rounded-[12px] border border-[#2E2822] bg-[#16130F] px-3 py-2 text-xs text-[#A79C92]">
                        <span className="font-semibold text-[#D8CFC6]">{o.pickupPoint ?? o.deliveryAddress}</span>
                        {o.deliverySlot && <span> · {o.deliverySlot}</span>}
                        {o.pickupCode && <span className="ml-2 font-mono text-lime">{o.pickupCode}</span>}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {o.items.map((i, idx) => (
                        <span
                          key={idx}
                          className="rounded-btn bg-[#16130F] px-2.5 py-1 text-xs text-[#8A7F76]"
                        >
                          {i.sku}
                          {i.imei ? (
                            <button
                              type="button"
                              disabled={busy === `label-${i.imei}`}
                              onClick={() => printLabel(i.imei!)}
                              title="Печать этикетки IMEI"
                              className="ml-1.5 font-mono text-lime underline decoration-dotted underline-offset-2 hover:text-white disabled:text-[#6E645C]"
                            >
                              {busy === `label-${i.imei}` ? '…' : `✓ ${i.imei}`}
                            </button>
                          ) : (
                            <span className="ml-1.5 text-[#8A7F76]">× {i.qty}</span>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      {imeis.length > 0 && (
                        <span className="font-mono text-xs text-lime">
                          IMEI назначено: {imeis.length}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => act(o)}
                        className="ml-auto rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-[#2E2822]"
                      >
                        {busy === o.id ? '…' : stage.action}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {toast && (
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-lime px-6 py-3 text-sm font-semibold text-lime-ink">
          {toast}
        </div>
      )}
    </div>
  );
}
