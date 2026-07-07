'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useCompare } from '@/lib/compare';
import { useCart } from '@/lib/cart';
import { conditionLabel, som } from '@/lib/format';
import { MobileTabBar } from '@/components/MobileTabBar';

/** Attribute value as a display string, or '—' when absent. */
function attr(p: CatalogProduct, keys: string[]): string {
  const a = p.attrs ?? {};
  for (const k of keys) {
    const v = a[k];
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  return '—';
}

export default function ComparePage() {
  const { ids, remove, hydrated } = useCompare();
  const { add } = useCart();
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items)).catch(() => setProducts([]));
  }, []);

  const list = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as CatalogProduct[];
  const bestPrice = list.length > 1 ? Math.min(...list.map((p) => p.price)) : -1;

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-5">
          <h1 className="mb-3.5 font-display text-xl font-bold">Сравнение</h1>

          {hydrated && list.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-5xl">⇄</div>
              <div className="mt-3.5 font-display text-[17px] font-bold">Нечего сравнивать</div>
              <div className="mt-2 text-[13px] leading-relaxed text-[#A79C92]">Добавьте до 4 товаров из каталога кнопкой ⇄</div>
              <Link href="/" className="mt-4 inline-block rounded-[11px] bg-lime px-5 py-3 text-[13px] font-bold text-lime-ink">В каталог</Link>
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-2">
              {list.map((p) => {
                const inStock = p.availableUnits > 0;
                const best = p.price === bestPrice;
                return (
                  <div key={p.id} className="w-[150px] flex-shrink-0 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3">
                    <Link href={`/product/${p.id}`} className="mb-2 grid h-20 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display text-2xl font-extrabold text-white/15">
                      {p.name.slice(0, 1)}
                    </Link>
                    {best && (
                      <div className="mb-1.5 inline-block rounded-[6px] bg-lime px-1.5 py-0.5 text-[10px] font-bold text-lime-ink">ЛУЧШАЯ ЦЕНА</div>
                    )}
                    <div className="min-h-[32px] text-[12px] font-semibold leading-tight">{p.name}</div>
                    <div className="mt-1 font-display text-[15px] font-extrabold">{som(p.price)}</div>
                    <div className="my-2 border-t border-[#2E2822] pt-2 text-[11px] leading-[1.8] text-[#A79C92]">
                      {attr(p, ['brand', 'Бренд', 'производитель'])}
                      <br />
                      {attr(p, ['memory', 'storage', 'Память', 'объём'])}
                      <br />
                      🛡 {conditionLabel(p.attrs) === 'Б/У' ? '6 мес' : '12 мес'}
                      <br />
                      <span className={inStock ? 'text-lime' : 'text-[#E5B23C]'}>{inStock ? `${p.availableUnits} в наличии` : 'под заказ'}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!inStock}
                      onClick={() => add({ id: p.id, sku: p.sku, name: p.name, price: p.price })}
                      className="w-full rounded-[8px] bg-lime py-1.5 text-center text-[12px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
                    >
                      В корзину
                    </button>
                    <button type="button" onClick={() => remove(p.id)} className="mt-2 w-full text-center text-[11px] text-[#8A7F76]">
                      Убрать
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <MobileTabBar active="catalog" />
      </div>
    </div>
  );
}
