'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchOrder, fetchOrderLedger, type OrderDetail } from '@/lib/api';
import { buildOrderTimeline, TERMINAL_BAD, type TimelineStep } from '@/lib/order-status';
import { som } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { AccountDetailFrame } from '@/components/AccountDetailFrame';

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function OrderStatusPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, hydrated, authed } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null | 'missing'>(null);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      setOrder('missing');
      setSteps([]);
      return;
    }
    Promise.all([
      authed((token) => fetchOrder(params.id, token)),
      authed((token) => fetchOrderLedger(params.id, token)),
    ])
      .then(([nextOrder, ledger]) => {
        setOrder(nextOrder ?? 'missing');
        setSteps(buildOrderTimeline(ledger));
      })
      // `setOrder('missing')` объявлял заказ несуществующим при любом сбое сети.
      // Покупатель читал «Заказ не найден» про оплаченный заказ — худшая из
      // подмен в этом классе: она провоцирует повторную оплату и звонок.
      .catch((cause) => {
        setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить заказ');
      });
  }, [authed, hydrated, params.id, user]);

  const frame = (children: React.ReactNode) => (
    <AccountDetailFrame>{children}</AccountDetailFrame>
  );

  if (loadError) {
    return frame(
      <div className="grid flex-1 place-items-center text-center">
        <div>
          <p className="font-display text-lg font-bold">Заказ не загрузился</p>
          <p className="mt-2 px-6 text-sm text-subtle">{loadError}</p>
          <p className="mt-1 px-6 text-sm text-muted">Заказ никуда не делся — мы не смогли получить его статус.</p>
          <Link href="/account" className="mt-3 inline-block text-sm text-lime">← В кабинет</Link>
        </div>
      </div>,
    );
  }
  if (order === null) return frame(<div className="grid flex-1 place-items-center font-mono text-sm text-subtle">Загрузка…</div>);
  if (order === 'missing') return frame(<div className="grid flex-1 place-items-center text-center"><div><p className="font-display text-lg font-bold">Заказ не найден</p><Link href="/account" className="mt-3 inline-block text-sm text-lime">← В кабинет</Link></div></div>);

  const bad = TERMINAL_BAD[order.status];

  return frame(
    <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
      <div className="mb-1.5 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-xl">←</button>
        <span className="font-display text-xl font-bold">Заказ #{order.id.slice(-8)}</span>
      </div>
      <div className="mb-4 ml-8 text-[13px] text-muted">{fmt(order.createdAt)} · {som(order.total)}</div>

      {bad && (
        <div className="mb-3 rounded-[14px] border border-danger-soft/30 bg-danger-soft/5 p-4 text-sm font-semibold text-danger-soft">{bad}</div>
      )}

      {(order.pickupPoint || order.deliveryAddress || order.pickupCode) && (
        <div className="mb-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-subtle">Получение</div>
          <div className="text-sm font-semibold text-white">
            {order.pickupPoint ?? order.deliveryAddress ?? order.fulfillmentType}
          </div>
          {order.deliverySlot && <div className="mt-1 text-xs text-muted">{order.deliverySlot}</div>}
          {order.pickupCode && <div className="mt-2 font-display text-lg font-extrabold text-lime">{order.pickupCode}</div>}
        </div>
      )}

      <div className="rounded-[16px] border border-surface-3 bg-surface-2 p-[18px]">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const mark = s.state === 'done' ? '✓' : s.state === 'current' ? '•' : i + 1;
          const circle =
            s.state === 'done' ? 'bg-lime text-lime-ink' : s.state === 'current' ? 'bg-coral text-white' : 'bg-surface-3 text-subtle';
          return (
            <div key={s.title} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full text-[13px] ${circle}`}>{mark}</span>
                {!last && <span className={`min-h-[14px] w-0.5 flex-1 ${s.state === 'done' ? 'bg-lime' : 'bg-surface-3'}`} />}
              </div>
              <div className="pb-4">
                <div className={`text-sm font-semibold ${s.state === 'future' ? 'text-subtle' : 'text-white'}`}>{s.title}</div>
                <div className="mt-0.5 text-xs text-subtle">{s.time ? fmt(s.time) : s.state === 'current' ? 'в процессе' : '—'}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <Link href="/account/orders" className="rounded-[11px] border border-surface-3 bg-surface-2 py-3 text-center text-bright">🧾 Чек</Link>
        <Link href="/account/devices" className="rounded-[11px] border border-surface-3 bg-surface-2 py-3 text-center text-bright">🛡 Гарантия</Link>
        <a href="https://wa.me/996700000000" target="_blank" rel="noreferrer" className="rounded-[11px] border border-surface-3 bg-surface-2 py-3 text-center text-bright">💬 WhatsApp</a>
        <Link href={`/account/orders/${order.id}`} className="rounded-[11px] border border-surface-3 bg-surface-2 py-3 text-center text-muted">Детали</Link>
      </div>
    </div>,
  );
}
