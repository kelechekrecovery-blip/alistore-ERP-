'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MobileAppFrame } from '@/components/MobileAppFrame';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';

const popular = ['iphone', 'macbook', 'airpods', 'apple watch', 'б/у с гарантией'];

export default function SearchPage() {
  const { add } = useCart();
  const [q, setQ] = useState('iphone');
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      fetchCatalog({ q, limit: 40 }).then((res) => {
        if (!cancelled) setItems(res.items);
      }).catch(() => {
        if (!cancelled) setItems([]);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  const inStock = useMemo(() => items.filter((p) => p.availableUnits > 0), [items]);

  return (
    <MobileAppFrame title="Поиск" subtitle="Каталог ищет по названию, SKU и категории." active="catalog" backHref="/">
      <div className="mb-4 flex items-center gap-2 rounded-[12px] border border-lime bg-[#221E19] px-3 py-2.5">
        <span className="text-[#6E645C]">🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#6E645C]" placeholder="iphone" />
      </div>

      <div className="mb-2 text-[13px] text-[#A79C92]">Популярные запросы</div>
      <div className="mb-4 flex flex-wrap gap-2">
        {popular.map((item) => (
          <button key={item} type="button" onClick={() => setQ(item)} className="rounded-chip border border-[#2E2822] bg-[#221E19] px-3.5 py-2 text-xs text-[#D8CFC6]">
            {item}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] text-[#A79C92]">Результаты</span>
        <span className="font-mono text-[11px] text-[#6E645C]">{loading ? '...' : `${inStock.length} в наличии`}</span>
      </div>
      {items.map((p) => {
        const canBuy = p.availableUnits > 0;
        return (
          <div key={p.id} className="mb-2 flex gap-3 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3">
            <Link href={`/product/${p.id}`} className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display text-xl font-extrabold text-white/15">{p.name.slice(0, 1)}</Link>
            <div className="min-w-0 flex-1">
              <Link href={`/product/${p.id}`} className="block truncate text-[13px] font-semibold">{p.name}</Link>
              <div className="mt-1 font-display text-[14px] font-extrabold">{som(p.price)}</div>
              <div className={`mt-0.5 text-[11px] ${canBuy ? 'text-lime' : 'text-[#E5B23C]'}`}>{canBuy ? `${p.availableUnits} в наличии` : 'под заказ'}</div>
            </div>
            <button type="button" disabled={!canBuy} onClick={() => add({ id: p.id, sku: p.sku, name: p.name, price: p.price })} className="self-center rounded-[9px] bg-lime px-3 py-2 text-xs font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">+</button>
          </div>
        );
      })}
      {!loading && items.length === 0 && <div className="py-8 text-center text-sm text-[#8A7F76]">Ничего не нашли</div>}
    </MobileAppFrame>
  );
}
