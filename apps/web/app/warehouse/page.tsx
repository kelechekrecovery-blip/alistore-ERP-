'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchOrdersByStatus,
  fulfillOrder,
  transitionOrder,
  type QueueOrder,
} from '@/lib/api';
import { som } from '@/lib/format';
import { WarehouseOps } from '@/components/WarehouseOps';

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

  const load = useCallback((s: Stage) => {
    setOrders(null);
    fetchOrdersByStatus(s.status)
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    load(stage);
  }, [stage, load]);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function act(order: QueueOrder) {
    setBusy(order.id);
    try {
      if (stage.kind === 'fulfill') {
        const res = await fulfillOrder(order.id);
        flash(`Назначено IMEI: ${res.assigned.length} · заказ #${order.id.slice(-6)}`);
      } else if (stage.to) {
        await transitionOrder(order.id, stage.to);
        flash(`Заказ #${order.id.slice(-6)} → ${stage.to}`);
      }
      load(stage);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sand bg-grain">
      <header className="flex items-center gap-4 border-b border-ink/10 bg-white/80 px-6 py-4 backdrop-blur">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-ink font-display text-lg font-extrabold text-sand">
          W
        </span>
        <div>
          <div className="font-display text-lg font-bold text-ink">Склад · Сборка заказов</div>
          <div className="text-xs text-ink/50">Назначение IMEI и движение по статусам</div>
        </div>
        <Link
          href="/"
          className="ml-auto rounded-chip border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
        >
          ⌂ Выйти
        </Link>
      </header>

      <div className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-ink/10 bg-white/50 px-6 py-3">
        {STAGES.map((s) => (
          <button
            key={s.status}
            type="button"
            onClick={() => setStage(s)}
            className={`flex-shrink-0 rounded-chip px-4 py-2 text-sm font-semibold transition ${
              stage.status === s.status
                ? 'bg-ink text-sand'
                : 'border border-ink/15 bg-white text-ink/70 hover:border-ink/30'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl">
          <WarehouseOps />
          {orders === null && <p className="font-mono text-sm text-ink/40">Загрузка…</p>}
          {orders && orders.length === 0 && (
            <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-16 text-center">
              <p className="font-display text-lg font-bold text-ink">Пусто</p>
              <p className="mt-1 text-sm text-ink/55">Нет заказов в статусе «{stage.label}».</p>
            </div>
          )}
          {orders && orders.length > 0 && (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => {
                const count = o.items.reduce((s, i) => s + i.qty, 0);
                const imeis = o.items.map((i) => i.imei).filter(Boolean) as string[];
                return (
                  <li key={o.id} className="rounded-card border border-ink/10 bg-white p-5 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-ink">#{o.id.slice(-8)}</span>
                      <span className="rounded-chip bg-tint px-2.5 py-0.5 text-xs font-semibold text-deep">
                        {o.channel}
                      </span>
                      {o.customer && (
                        <span className="font-mono text-xs text-ink/50">{o.customer.phone}</span>
                      )}
                      <span className="text-sm text-ink/60">
                        {count} {count === 1 ? 'товар' : 'товара/ов'}
                      </span>
                      <span className="ml-auto font-mono font-bold tabular text-ink">
                        {som(o.total)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {o.items.map((i, idx) => (
                        <span
                          key={idx}
                          className="rounded-btn bg-sand px-2.5 py-1 text-xs text-ink/70"
                        >
                          {i.sku}
                          {i.imei ? (
                            <span className="ml-1.5 font-mono text-success">✓ {i.imei}</span>
                          ) : (
                            <span className="ml-1.5 text-ink/40">× {i.qty}</span>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      {imeis.length > 0 && (
                        <span className="font-mono text-xs text-success">
                          IMEI назначено: {imeis.length}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => act(o)}
                        className="ml-auto rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-ink/20"
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
        <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-ink px-6 py-3 text-sm font-semibold text-sand">
          {toast}
        </div>
      )}
    </div>
  );
}
