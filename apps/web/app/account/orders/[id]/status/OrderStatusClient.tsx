'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchOrder, fetchOrderLedger, type OrderDetail } from '@/lib/api';
import { buildOrderTimeline, TERMINAL_BAD, type TimelineStep } from '@/lib/order-status';
import { som } from '@/lib/format';
import { useAuth } from '@/lib/auth';

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function OrderStatusPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, hydrated, authed } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null | 'missing'>(null);
  const [steps, setSteps] = useState<TimelineStep[]>([]);

  useEffect(() => {
    fetchOrder(params.id).then((o) => setOrder(o ?? 'missing'));
  }, [params.id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      setSteps([]);
      return;
    }
    authed((token) => fetchOrderLedger(params.id, token))
      .then((l) => setSteps(buildOrderTimeline(l)))
      .catch(() => setSteps([]));
  }, [authed, hydrated, params.id, user]);

  const frame = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">{children}</div>
    </div>
  );

  if (order === null) return frame(<div className="grid flex-1 place-items-center font-mono text-sm text-[#8A7F76]">Загрузка…</div>);
  if (order === 'missing') return frame(<div className="grid flex-1 place-items-center text-center"><div><p className="font-display text-lg font-bold">Заказ не найден</p><Link href="/account" className="mt-3 inline-block text-sm text-lime">← В кабинет</Link></div></div>);

  const bad = TERMINAL_BAD[order.status];

  return frame(
    <div className="flex-1 overflow-y-auto px-4 pb-8 pt-5">
      <div className="mb-1.5 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-xl">←</button>
        <span className="font-display text-xl font-bold">Заказ #{order.id.slice(-8)}</span>
      </div>
      <div className="mb-4 ml-8 text-[13px] text-[#A79C92]">{fmt(order.createdAt)} · {som(order.total)}</div>

      {bad && (
        <div className="mb-3 rounded-[14px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/5 p-4 text-sm font-semibold text-[#FF8A7A]">{bad}</div>
      )}

      {(order.pickupPoint || order.deliveryAddress || order.pickupCode) && (
        <div className="mb-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-[#8A7F76]">Получение</div>
          <div className="text-sm font-semibold text-white">
            {order.pickupPoint ?? order.deliveryAddress ?? order.fulfillmentType}
          </div>
          {order.deliverySlot && <div className="mt-1 text-xs text-[#A79C92]">{order.deliverySlot}</div>}
          {order.pickupCode && <div className="mt-2 font-display text-lg font-extrabold text-lime">{order.pickupCode}</div>}
        </div>
      )}

      <div className="rounded-[16px] border border-[#2E2822] bg-[#221E19] p-[18px]">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const mark = s.state === 'done' ? '✓' : s.state === 'current' ? '•' : i + 1;
          const circle =
            s.state === 'done' ? 'bg-lime text-lime-ink' : s.state === 'current' ? 'bg-coral text-white' : 'bg-[#2E2822] text-[#8A7F76]';
          return (
            <div key={s.title} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full text-[13px] ${circle}`}>{mark}</span>
                {!last && <span className={`min-h-[14px] w-0.5 flex-1 ${s.state === 'done' ? 'bg-lime' : 'bg-[#2E2822]'}`} />}
              </div>
              <div className="pb-4">
                <div className={`text-sm font-semibold ${s.state === 'future' ? 'text-[#8A7F76]' : 'text-white'}`}>{s.title}</div>
                <div className="mt-0.5 text-xs text-[#8A7F76]">{s.time ? fmt(s.time) : s.state === 'current' ? 'в процессе' : '—'}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <Link href="/account/orders" className="rounded-[11px] border border-[#2E2822] bg-[#221E19] py-3 text-center text-[#D8CFC6]">🧾 Чек</Link>
        <Link href="/account/devices" className="rounded-[11px] border border-[#2E2822] bg-[#221E19] py-3 text-center text-[#D8CFC6]">🛡 Гарантия</Link>
        <a href="https://wa.me/996700000000" target="_blank" rel="noreferrer" className="rounded-[11px] border border-[#2E2822] bg-[#221E19] py-3 text-center text-[#D8CFC6]">💬 WhatsApp</a>
        <Link href={`/account/orders/${order.id}`} className="rounded-[11px] border border-[#2E2822] bg-[#221E19] py-3 text-center text-[#A79C92]">Детали</Link>
      </div>
    </div>,
  );
}
