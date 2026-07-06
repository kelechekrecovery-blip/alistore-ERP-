'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchCatalog,
  fetchOrder,
  type CatalogProduct,
  type OrderDetail,
} from '@/lib/api';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';

const TIMELINE = [
  { label: 'Оформлен' },
  { label: 'Собран' },
  { label: 'Оплачен' },
  { label: 'Сборка' },
  { label: 'Доставка' },
  { label: 'Завершён' },
];

// order status → index in TIMELINE
const STAGE: Record<string, number> = {
  draft: 0, created: 0, awaiting_confirmation: 0,
  confirmed: 1, reserved: 1, awaiting_payment: 1,
  paid: 2,
  picking: 3, packed: 3,
  ready_for_pickup: 4, courier_assigned: 4, out_for_delivery: 4, delivered: 4,
  completed: 5,
};

const TERMINAL_BAD = new Set(['cancelled', 'returned', 'refunded']);

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { add } = useCart();
  const [order, setOrder] = useState<OrderDetail | null | 'missing'>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    fetchOrder(params.id).then((o) => setOrder(o ?? 'missing'));
    fetchCatalog({ limit: 100 }).then((c) => setCatalog(c.items));
  }, [params.id]);

  const bySku = useMemo(() => new Map(catalog.map((p) => [p.sku, p])), [catalog]);

  if (order === null) {
    return <div className="py-24 text-center font-mono text-sm text-ink/40">Загрузка…</div>;
  }
  if (order === 'missing') {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-lg font-bold text-ink">Заказ не найден</p>
        <Link href="/account" className="mt-4 inline-flex text-sm text-coral hover:text-deep">
          ← В кабинет
        </Link>
      </div>
    );
  }

  const stageIdx = STAGE[order.status] ?? 0;
  const bad = TERMINAL_BAD.has(order.status);

  function reorder() {
    if (order === null || order === 'missing') return;
    let addedAny = false;
    for (const item of order.items) {
      const p = bySku.get(item.sku);
      if (p) {
        add({ id: p.id, sku: p.sku, name: p.name, price: item.price }, item.qty);
        addedAny = true;
      }
    }
    if (addedAny) router.push('/cart');
  }

  return (
    <div className="py-8">
      <nav className="mb-6 text-sm text-ink/50">
        <Link href="/account" className="transition hover:text-ink">
          Кабинет
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink/70">Заказ #{order.id.slice(-8)}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold text-ink">Заказ #{order.id.slice(-8)}</h1>
        <span className="font-mono text-sm text-ink/45">{order.channel}</span>
        <button
          type="button"
          onClick={reorder}
          className="ml-auto rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep"
        >
          Повторить заказ
        </button>
      </div>

      {/* timeline */}
      {bad ? (
        <div className="mb-8 rounded-card border border-danger/30 bg-danger/5 px-5 py-4 text-sm font-semibold text-danger">
          Заказ {order.status === 'cancelled' ? 'отменён' : order.status === 'refunded' ? 'возвращён (деньги)' : 'возвращён'}
        </div>
      ) : (
        <ol className="mb-8 flex items-center gap-2">
          {TIMELINE.map((t, i) => {
            const reached = i <= stageIdx;
            const current = i === stageIdx;
            return (
              <li key={t.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-center">
                  <span
                    className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                      current
                        ? 'bg-coral text-white'
                        : reached
                        ? 'bg-success text-white'
                        : 'bg-ink/10 text-ink/40'
                    }`}
                  >
                    {reached && !current ? '✓' : i + 1}
                  </span>
                  {i < TIMELINE.length - 1 && (
                    <span className={`h-0.5 flex-1 ${i < stageIdx ? 'bg-success' : 'bg-ink/10'}`} />
                  )}
                </div>
                <span className={`text-center text-xs ${reached ? 'font-semibold text-ink' : 'text-ink/40'}`}>
                  {t.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-card border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="mb-3 font-display text-lg font-bold text-ink">Состав заказа</h2>
          <ul className="divide-y divide-ink/10">
            {order.items.map((i, idx) => (
              <li key={idx} className="flex items-center gap-3 py-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-btn bg-tint font-display font-bold text-coral/50">
                  {(bySku.get(i.sku)?.name ?? i.sku).slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {bySku.get(i.sku)?.name ?? i.sku}
                  </p>
                  {i.imei && <p className="font-mono text-[11px] text-ink/45">IMEI {i.imei}</p>}
                </div>
                <span className="text-sm text-ink/50">× {i.qty}</span>
                <span className="w-24 text-right font-mono font-semibold tabular text-ink">
                  {som(i.price * i.qty)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="h-fit rounded-card border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <span className="text-ink/60">Итого</span>
            <span className="font-mono text-2xl font-bold tabular text-ink">{som(order.total)}</span>
          </div>
          {order.payments.length > 0 && (
            <div className="mt-4 border-t border-ink/10 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Оплата</p>
              {order.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between py-1 text-sm">
                  <span className="text-ink/60">{p.method}</span>
                  <span className="font-mono tabular text-ink">{som(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
