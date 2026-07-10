'use client';

import { useEffect, useMemo, useState } from 'react';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';

const SORTS = [
  { id: 'popular', label: 'Популярные' },
  { id: 'price-asc', label: 'Дешевле' },
  { id: 'price-desc', label: 'Дороже' },
] as const;

export default function MobileCatalog() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [category, setCategory] = useState('Все');
  const [stockOnly, setStockOnly] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCategory(params.get('category') ?? 'Все');
    fetchCatalog({ limit: 100 })
      .then((response) => setProducts(response.items))
      .catch(() => setProducts([]));
  }, []);

  const categories = useMemo(
    () => ['Все', ...Array.from(new Set((products ?? []).map((p) => p.category))).sort()],
    [products],
  );
  const sort = SORTS[sortIdx];
  const visible = useMemo(() => {
    const items = (products ?? []).filter(
      (p) => (category === 'Все' || p.category === category) && (!stockOnly || p.availableUnits > 0),
    );
    return [...items].sort((a, b) =>
      sort.id === 'price-asc'
        ? a.price - b.price
        : sort.id === 'price-desc'
          ? b.price - a.price
          : b.availableUnits - a.availableUnits,
    );
  }, [products, category, stockOnly, sort]);

  const reset = () => {
    setCategory('Все');
    setStockOnly(false);
    setSortIdx(0);
  };

  return (
    <MobileFrame active="catalog">
      <div className="px-4 pb-6 pt-1">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-display text-[20px] font-bold text-white">Каталог</span>
          <span className="text-[13px] text-[#8A7F76]">{products === null ? '…' : visible.length}</span>
        </div>

        {/* filter chips */}
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                category === c
                  ? 'border-lime bg-lime text-lime-ink'
                  : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* sort + stock toggles */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setSortIdx((i) => (i + 1) % SORTS.length)}
            className="flex-1 rounded-[10px] border border-[#2E2822] bg-[#221E19] py-2.5 text-center text-xs text-[#D8CFC6]"
          >
            ↕ {sort.label}
          </button>
          <button
            type="button"
            onClick={() => setStockOnly((v) => !v)}
            className={`flex-1 rounded-[10px] border border-[#2E2822] py-2.5 text-center text-xs transition ${
              stockOnly ? 'bg-lime/10 text-lime' : 'bg-[#221E19] text-[#D8CFC6]'
            }`}
          >
            ✓ В наличии
          </button>
        </div>

        {products === null ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[248px] animate-pulse rounded-[16px] border border-[#2E2822] bg-[#221E19]" />
            ))}
          </div>
        ) : visible.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((product, i) => (
              <MobileProductCard key={product.id} product={product} showCompare priority={i === 0} />
            ))}
          </div>
        ) : (
          <div className="py-14 text-center">
            <div className="text-5xl">🔍</div>
            <div className="mt-3.5 font-display text-[17px] font-bold text-white">Ничего не найдено</div>
            <div className="mt-2 text-[13px] text-[#A79C92]">Попробуйте изменить фильтры</div>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-[10px] border border-[#2E2822] bg-[#221E19] px-5 py-2.5 text-[13px] text-lime"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
