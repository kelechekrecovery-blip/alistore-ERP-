'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { som, conditionLabel } from '@/lib/format';
import { MobileTabBar } from '@/components/MobileTabBar';

const CAT_ICON: Record<string, string> = {
  Смартфоны: '📱', Ноутбуки: '💻', Аудио: '🎧', Часы: '⌚', Планшеты: '📲', Аксессуары: '🔌',
};
const icon = (c: string) => CAT_ICON[c] ?? '📦';

export default function HomePage() {
  const { add } = useCart();
  const { has, toggle } = useFavorites();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [cat, setCat] = useState('all');

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items)).catch(() => setProducts([]));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.category))).sort(),
    [products],
  );
  const list = (products ?? []).filter((p) => cat === 'all' || p.category === cat);
  const hero = useMemo(
    () => (products ?? []).slice().sort((a, b) => b.price - a.price)[0],
    [products],
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        {/* header */}
        <div className="flex-shrink-0 px-4 pb-3 pt-5">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="text-xs text-[#A79C92]">📍 Бишкек ▾</span>
            <div className="ml-auto flex items-center gap-3.5 text-[17px]">
              <Link href="/favorites">🤍</Link>
              <Link href="/account/notifications">🔔</Link>
              <Link href="/account">👤</Link>
            </div>
          </div>
          <Link href="/search" className="flex items-center gap-2.5 rounded-[13px] border border-[#2E2822] bg-[#221E19] px-3.5 py-3">
            <span className="text-[#6E645C]">🔍</span>
            <span className="text-sm text-[#6E645C]">Поиск техники, брендов…</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-24">
          {/* delivery banners */}
          <div className="mb-3.5 flex gap-2">
            <div className="flex-1 rounded-[15px] bg-gradient-to-br from-coral to-deep p-3.5">
              <div className="text-xl">⚡</div>
              <div className="mt-1.5 text-[13px] font-bold">Доставка 1–2 ч</div>
              <div className="text-[11px] text-[#FFE0D5]">по Бишкеку</div>
            </div>
            <div className="flex-1 rounded-[15px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="text-xl">🏬</div>
              <div className="mt-1.5 text-[13px] font-bold">Самовывоз</div>
              <div className="text-[11px] text-[#A79C92]">бесплатно</div>
            </div>
            <Link href="/trade-in" className="flex-1 rounded-[15px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="text-xl">♻️</div>
              <div className="mt-1.5 text-[13px] font-bold">Trade-in</div>
              <div className="text-[11px] text-lime">оценка 30с</div>
            </Link>
          </div>

          {/* categories */}
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setCat('all')} className={`flex-shrink-0 rounded-[12px] border px-3.5 py-2.5 text-center ${cat === 'all' ? 'border-lime bg-lime/10' : 'border-[#2E2822] bg-[#221E19]'}`}>
              <div className="text-2xl">🛍</div>
              <div className="mt-1 whitespace-nowrap text-[11px] text-[#D8CFC6]">Все</div>
            </button>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={`flex-shrink-0 rounded-[12px] border px-3.5 py-2.5 text-center ${cat === c ? 'border-lime bg-lime/10' : 'border-[#2E2822] bg-[#221E19]'}`}>
                <div className="text-2xl">{icon(c)}</div>
                <div className="mt-1 whitespace-nowrap text-[11px] text-[#D8CFC6]">{c}</div>
              </button>
            ))}
          </div>

          {/* hero promo */}
          {hero && (
            <Link href={`/product/${hero.id}`} className="relative mb-5 block overflow-hidden rounded-[20px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#16130F] p-5">
              <div className="font-mono text-[11px] text-lime">ХИТ · В НАЛИЧИИ</div>
              <div className="mt-2 font-display text-2xl font-extrabold leading-none">{hero.name}</div>
              <div className="mt-1 text-[13px] text-[#A79C92]">от {som(hero.price)} · рассрочка 0-0-12</div>
              <span className="mt-4 inline-block rounded-[10px] bg-lime px-4 py-2.5 text-[13px] font-bold text-lime-ink">Смотреть</span>
              <div className="absolute -bottom-3 -right-2 text-[90px] opacity-15">📱</div>
            </Link>
          )}

          {/* hits grid */}
          <div className="mb-3 flex items-center">
            <span className="font-display text-lg font-bold">🔥 Хиты продаж</span>
            <span className="ml-auto text-[13px] text-lime">{list.length} тов.</span>
          </div>
          {products === null ? (
            <p className="py-6 font-mono text-sm text-[#8A7F76]">Загрузка…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {list.map((p) => {
                const inStock = p.availableUnits > 0;
                const used = conditionLabel(p.attrs) === 'Б/У';
                return (
                  <div key={p.id} className="overflow-hidden rounded-[16px] border border-[#2E2822] bg-[#221E19]">
                    <div className="relative h-[110px]">
                      <Link href={`/product/${p.id}`} className="block h-full bg-gradient-to-br from-[#2A2620] to-[#16130F]">
                        <span className="absolute inset-0 grid place-items-center font-display text-4xl font-extrabold text-white/10">{p.name.slice(0, 1)}</span>
                      </Link>
                      <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${used ? 'bg-ink text-lime' : 'bg-lime text-lime-ink'}`}>{used ? 'Б/У' : 'Новое'}</span>
                      <button type="button" onClick={() => toggle(p.id)} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-sm">{has(p.id) ? '❤️' : '🤍'}</button>
                    </div>
                    <div className="p-2.5">
                      <Link href={`/product/${p.id}`} className="block min-h-[34px] text-[13px] font-semibold leading-tight">{p.name}</Link>
                      <div className="mt-1.5 font-display text-base font-extrabold">{som(p.price)}</div>
                      <div className={`mt-0.5 text-[10px] ${inStock ? 'text-[#8A7F76]' : 'text-[#FF8A7A]'}`}>{inStock ? `${p.availableUnits} в наличии` : 'под заказ'}</div>
                      <button
                        type="button"
                        disabled={!inStock}
                        onClick={() => add({ id: p.id, sku: p.sku, name: p.name, price: p.price })}
                        className="mt-2.5 w-full rounded-[9px] bg-lime py-2 text-center text-xs font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
                      >
                        В корзину
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <MobileTabBar active="home" />
      </div>
    </div>
  );
}
