'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, fetchOrder, type CatalogProduct, type OrderDetail } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { WarrantyRequest } from '@/components/WarrantyRequest';
import { som } from '@/lib/format';

const TIMELINE = ['Оформлен', 'Собран', 'Оплачен', 'Сборка', 'Доставка', 'Завершён'];
const STAGE: Record<string, number> = {
  draft: 0, created: 0, awaiting_confirmation: 0, confirmed: 1, reserved: 1, awaiting_payment: 1,
  paid: 2, picking: 3, packed: 3, ready_for_pickup: 4, courier_assigned: 4, out_for_delivery: 4, delivered: 4, completed: 5,
};
const BAD = new Set(['cancelled', 'returned', 'refunded']);

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { add } = useCart();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null | 'missing'>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    fetchOrder(params.id).then((o) => setOrder(o ?? 'missing'));
    fetchCatalog({ limit: 100 }).then((c) => setCatalog(c.items));
  }, [params.id]);
  const bySku = useMemo(() => new Map(catalog.map((p) => [p.sku, p])), [catalog]);

  const frame = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">{children}</div>
    </div>
  );

  if (order === null) return frame(<div className="grid flex-1 place-items-center font-mono text-sm text-[#8A7F76]">Загрузка…</div>);
  if (order === 'missing') return frame(<div className="grid flex-1 place-items-center text-center"><div><p className="font-display text-lg font-bold">Заказ не найден</p><Link href="/account" className="mt-3 inline-block text-sm text-lime">← В кабинет</Link></div></div>);

  const stageIdx = STAGE[order.status] ?? 0;
  const bad = BAD.has(order.status);

  function reorder() {
    if (order === null || order === 'missing') return;
    let any = false;
    for (const i of order.items) { const p = bySku.get(i.sku); if (p) { add({ id: p.id, sku: p.sku, name: p.name, price: i.price }, i.qty); any = true; } }
    if (any) router.push('/cart');
  }

  return frame(
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5">
      <div className="mb-1 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="text-xl">←</button>
        <span className="font-display text-xl font-bold">Заказ #{order.id.slice(-8)}</span>
      </div>
      <div className="mb-3 ml-8 text-[13px] text-[#A79C92]">{order.channel} · {order.fulfillmentType ?? 'pickup'} · {som(order.total)}</div>

      {!bad && (
        <Link href={`/account/orders/${order.id}/status`} className="mb-4 flex items-center justify-between rounded-[13px] bg-lime px-4 py-3 text-[13px] font-bold text-lime-ink">
          <span>📍 Отследить заказ</span>
          <span>→</span>
        </Link>
      )}

      {bad ? (
        <div className="mb-4 rounded-[14px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/5 p-4 text-sm font-semibold text-[#FF8A7A]">
          Заказ {order.status === 'cancelled' ? 'отменён' : order.status === 'refunded' ? 'возвращён (деньги)' : 'возвращён'}
        </div>
      ) : (
        <div className="mb-4 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
          {TIMELINE.map((t, i) => {
            const reached = i <= stageIdx; const current = i === stageIdx;
            return (
              <div key={t} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full text-[13px] ${current ? 'bg-coral text-white' : reached ? 'bg-lime text-lime-ink' : 'bg-[#2E2822] text-[#8A7F76]'}`}>{reached && !current ? '✓' : i + 1}</span>
                  {i < TIMELINE.length - 1 && <span className={`min-h-[14px] w-0.5 flex-1 ${i < stageIdx ? 'bg-lime' : 'bg-[#2E2822]'}`} />}
                </div>
                <div className="pb-4"><div className={`text-sm font-semibold ${reached ? 'text-white' : 'text-[#8A7F76]'}`}>{t}</div></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-4 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-[#8A7F76]">Получение</div>
        <div className="flex justify-between gap-3 py-1 text-[13px]">
          <span className="text-[#A79C92]">Тип</span>
          <span className="text-right text-[#D8CFC6]">{order.fulfillmentType ?? 'pickup'}</span>
        </div>
        {order.pickupPoint && (
          <div className="flex justify-between gap-3 py-1 text-[13px]">
            <span className="text-[#A79C92]">Точка</span>
            <span className="text-right text-[#D8CFC6]">{order.pickupPoint}</span>
          </div>
        )}
        {order.deliveryAddress && (
          <div className="flex justify-between gap-3 py-1 text-[13px]">
            <span className="text-[#A79C92]">Адрес</span>
            <span className="text-right text-[#D8CFC6]">{order.deliveryAddress}</span>
          </div>
        )}
        {order.deliverySlot && (
          <div className="flex justify-between gap-3 py-1 text-[13px]">
            <span className="text-[#A79C92]">Слот</span>
            <span className="text-right text-[#D8CFC6]">{order.deliverySlot}</span>
          </div>
        )}
        {order.pickupCode && (
          <div className="mt-2 rounded-[11px] bg-lime/10 px-3 py-2">
            <div className="text-[11px] text-[#A79C92]">Код выдачи</div>
            <div className="mt-0.5 font-display text-lg font-extrabold text-lime">{order.pickupCode}</div>
          </div>
        )}
      </div>

      <div className="mb-2 font-display text-base font-bold">Состав</div>
      {order.items.map((i, idx) => (
        <div key={idx} className="mb-2 flex items-center gap-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display font-extrabold text-white/15">{(bySku.get(i.sku)?.name ?? i.sku).slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{bySku.get(i.sku)?.name ?? i.sku}</div>
            {i.imei && <div className="font-mono text-[11px] text-[#8A7F76]">IMEI {i.imei}</div>}
            {i.imei && user && <div className="mt-1"><WarrantyRequest imei={i.imei} customerId={user.customerId} /></div>}
          </div>
          <span className="text-[13px] text-[#8A7F76]">× {i.qty}</span>
          <span className="font-mono text-[13px] font-semibold">{som(i.price * i.qty)}</span>
        </div>
      ))}

      {order.payments.length > 0 && (
        <div className="mt-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#8A7F76]">Оплата</div>
          {order.payments.map((p, idx) => (
            <div key={idx} className="flex justify-between py-1 text-[13px]"><span className="text-[#A79C92]">{p.method}</span><span className="font-mono">{som(p.amount)}</span></div>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={reorder} className="rounded-[13px] border border-[#2E2822] bg-[#221E19] py-3.5 text-center text-[13px] font-semibold text-lime">🔁 Повторить</button>
        <Link href="/account/returns" className="rounded-[13px] border border-[#2E2822] bg-[#221E19] py-3.5 text-center text-[13px] font-semibold text-[#D8CFC6]">↩ Возврат</Link>
      </div>
      <Link href="/support" className="mt-2 block rounded-[13px] border border-[#2E2822] bg-[#221E19] py-3.5 text-center text-[13px] font-semibold text-[#D8CFC6]">💬 Написать в поддержку</Link>
    </div>,
  );
}
