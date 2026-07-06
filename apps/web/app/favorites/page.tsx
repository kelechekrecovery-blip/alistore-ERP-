'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useFavorites } from '@/lib/favorites';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';
import { MobileTabBar } from '@/components/MobileTabBar';

export default function FavoritesPage() {
  const { ids, has, remove, hydrated } = useFavorites();
  const { add } = useCart();
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items)).catch(() => setProducts([]));
  }, []);

  const list = products.filter((p) => has(p.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-5">
          <h1 className="mb-3.5 font-display text-xl font-bold">Избранное</h1>

          {hydrated && ids.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-5xl">🤍</div>
              <div className="mt-3.5 font-display text-[17px] font-bold">Пока пусто</div>
              <div className="mt-2 text-[13px] text-[#A79C92]">Сохраняйте товары, чтобы следить за ценой</div>
              <Link href="/" className="mt-4 inline-block rounded-[11px] bg-lime px-5 py-3 text-[13px] font-bold text-lime-ink">В каталог</Link>
            </div>
          ) : (
            list.map((p) => {
              const inStock = p.availableUnits > 0;
              return (
                <div key={p.id} className="mb-2.5 flex gap-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3">
                  <Link href={`/product/${p.id}`} className="grid h-[74px] w-[74px] flex-shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display text-2xl font-extrabold text-white/15">{p.name.slice(0, 1)}</Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${p.id}`} className="block text-[13px] font-semibold">{p.name}</Link>
                    <div className="mt-1 font-display text-[15px] font-extrabold">{som(p.price)}</div>
                    <div className={`text-[11px] ${inStock ? 'text-[#8A7F76]' : 'text-[#FF8A7A]'}`}>{inStock ? `${p.availableUnits} в наличии` : 'под заказ'}</div>
                    <div className="mt-2 flex gap-1.5">
                      <button type="button" disabled={!inStock} onClick={() => add({ id: p.id, sku: p.sku, name: p.name, price: p.price })} className="rounded-[8px] bg-lime px-3 py-1.5 text-xs font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">В корзину</button>
                      <button type="button" onClick={() => remove(p.id)} className="rounded-[8px] bg-[#2E2822] px-3 py-1.5 text-xs text-[#A79C92]">Убрать</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <MobileTabBar active="home" />
      </div>
    </div>
  );
}
