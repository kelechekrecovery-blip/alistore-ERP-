'use client';

import { useEffect, useState } from 'react';
import { ArrowUpDown, Check, SearchX } from 'lucide-react';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { fetchCatalog, fetchCatalogCategories, isCatalogUnavailable, type CatalogProduct, type CatalogQuery } from '@/lib/api';

// Подписи сортировки — те же слова, что в десктопном `<select>`
// (`CatalogClient.tsx:83`). Раньше первая была «В наличии» и стояла вплотную к
// переключателю «✓ В наличии»: две соседние кнопки читались одинаково, хотя
// одна сортирует, а другая фильтрует.
const SORTS = [
  { id: 'stock_desc', label: 'Сначала в наличии' },
  { id: 'price_asc', label: 'Сначала дешевле' },
  { id: 'price_desc', label: 'Сначала дороже' },
] as const;

export default function MobileCatalog() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [category, setCategory] = useState('Все');
  const [query, setQuery] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);
  const [categories, setCategories] = useState(['Все']);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCategory(params.get('category') ?? 'Все');
    setQuery(params.get('q')?.trim() ?? '');
    fetchCatalogCategories().then((items) => { if (items) setCategories(['Все', ...items.map((item) => item.category)]); });
  }, []);
  const sort = SORTS[sortIdx];
  useEffect(() => { setProducts(null); setError(false); fetchCatalog({ q: query || undefined, category: category === 'Все' ? undefined : category, stockOnly, sort: sort.id as CatalogQuery['sort'], limit: 20, offset }).then((response) => { if (isCatalogUnavailable(response)) throw new Error('catalog unavailable'); setProducts(response.items); setTotal(response.total); }).catch(() => { setProducts([]); setTotal(0); setError(true); }); }, [query, category, stockOnly, sort, offset, reloadKey]);

  const reset = () => {
    setCategory('Все');
    setQuery('');
    setStockOnly(false);
    setSortIdx(0);
    setOffset(0);
  };

  return (
    <MobileFrame active="catalog">
      <div className="px-4 pb-6 pt-1">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-display text-[20px] font-bold text-white">{query ? `Поиск: ${query}` : 'Каталог'}</span>
          <span className="text-[13px] text-subtle">{products === null ? '…' : total}</span>
        </div>

        {/* filter chips */}
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCategory(c); setOffset(0); }}
              className={`flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                category === c
                  ? 'border-lime bg-lime text-lime-ink'
                  : 'border-surface-3 bg-surface-2 text-bright'
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
            onClick={() => { setSortIdx((i) => (i + 1) % SORTS.length); setOffset(0); }}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-surface-3 bg-surface-2 py-2.5 text-center text-xs text-bright"
          >
            <ArrowUpDown size={14} aria-hidden /> {sort.label}
          </button>
          <button
            type="button"
            onClick={() => { setStockOnly((v) => !v); setOffset(0); }}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-surface-3 py-2.5 text-center text-xs transition ${
              stockOnly ? 'bg-lime/10 text-lime' : 'bg-surface-2 text-bright'
            }`}
          >
            <Check size={14} aria-hidden /> Только в наличии
          </button>
        </div>

        {products === null ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[248px] animate-pulse rounded-[16px] border border-surface-3 bg-surface-2" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[13px] border border-danger-soft/30 bg-danger-soft/10 px-4 py-12 text-center">
            <div className="font-display text-[17px] font-bold text-danger-soft">Каталог временно недоступен</div>
            <div className="mt-2 text-[13px] text-muted">Проверьте соединение и повторите попытку.</div>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-[10px] border border-surface-3 bg-surface-2 px-5 py-2.5 text-[13px] text-lime">Повторить</button>
          </div>
        ) : products.length > 0 ? (
          <><div className="grid grid-cols-2 gap-3">
            {products.map((product, i) => (
              <MobileProductCard key={product.id} product={product} showCompare priority={i === 0} />
            ))}
          </div><div className="mt-5 flex justify-center gap-2"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))} className="rounded-[10px] border border-surface-3 px-4 py-2 text-xs text-white disabled:opacity-30">Назад</button><button disabled={offset + 20 >= total} onClick={() => setOffset(offset + 20)} className="rounded-[10px] border border-surface-3 px-4 py-2 text-xs text-white disabled:opacity-30">Дальше</button></div></>
        ) : (
          <div className="py-14 text-center">
            <SearchX size={48} strokeWidth={1.4} aria-hidden className="mx-auto text-faint" />
            <div className="mt-3.5 font-display text-[17px] font-bold text-white">Ничего не найдено</div>
            <div className="mt-2 text-[13px] text-muted">Попробуйте изменить фильтры</div>
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-[10px] border border-surface-3 bg-surface-2 px-5 py-2.5 text-[13px] text-lime"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
