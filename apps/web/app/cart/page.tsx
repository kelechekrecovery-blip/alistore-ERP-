'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';

export default function CartPage() {
  const { items, subtotal, setQty, remove, hydrated } = useCart();

  if (hydrated && items.length === 0) {
    return (
      <div className="py-16">
        <div className="mx-auto max-w-md rounded-card border border-dashed border-ink/15 bg-white/50 px-6 py-14 text-center">
          <p className="font-display text-xl font-bold text-ink">Корзина пуста</p>
          <p className="mt-1 text-sm text-ink/55">Загляните в каталог — там есть что выбрать.</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-btn bg-coral px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-deep"
          >
            В каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="mb-6 font-display text-3xl font-extrabold text-ink">Корзина</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-4 rounded-card border border-ink/10 bg-white p-4 shadow-soft"
            >
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-tint to-sand font-display text-2xl font-extrabold text-coral/30">
                {item.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/product/${item.id}`}
                  className="block truncate font-semibold text-ink transition hover:text-deep"
                >
                  {item.name}
                </Link>
                <p className="font-mono text-[11px] text-ink/40">{item.sku}</p>
              </div>

              <div className="flex items-center rounded-btn border border-ink/15">
                <button
                  type="button"
                  aria-label="Уменьшить"
                  onClick={() => setQty(item.id, item.qty - 1)}
                  className="px-3 py-1.5 text-ink/70 transition hover:text-ink"
                >
                  −
                </button>
                <span className="w-8 text-center font-mono text-sm tabular">{item.qty}</span>
                <button
                  type="button"
                  aria-label="Увеличить"
                  onClick={() => setQty(item.id, item.qty + 1)}
                  className="px-3 py-1.5 text-ink/70 transition hover:text-ink"
                >
                  +
                </button>
              </div>

              <p className="w-28 text-right font-mono font-bold tabular text-ink">
                {som(item.price * item.qty)}
              </p>
              <button
                type="button"
                aria-label={`Убрать ${item.name}`}
                onClick={() => remove(item.id)}
                className="text-ink/35 transition hover:text-danger"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-card border border-ink/10 bg-white p-6 shadow-soft lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between">
            <span className="text-ink/60">Итого</span>
            <span className="font-mono text-2xl font-bold tabular text-ink">{som(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-ink/45">Доставку и оплату выберете на оформлении.</p>
          <Link
            href="/checkout"
            className="mt-5 block rounded-btn bg-coral py-3 text-center text-base font-semibold text-white transition hover:bg-deep"
          >
            Оформить заказ
          </Link>
          <Link
            href="/"
            className="mt-2 block py-2 text-center text-sm text-ink/55 transition hover:text-ink"
          >
            Продолжить покупки
          </Link>
        </aside>
      </div>
    </div>
  );
}
