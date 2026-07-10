'use client';

import { som } from '@/lib/format';
import { inputCls } from '@/lib/admin-product-form';
import type { AdminProduct } from '@/lib/api';

interface ProductListProps {
  products: AdminProduct[];
  loading: boolean;
  total: number;
  selectedId: string | null;
  query: string;
  includeArchived: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onIncludeArchivedChange: (value: boolean) => void;
  onSelect: (product: AdminProduct) => void;
  onStartCreate: () => void;
}

/**
 * Left column of the admin catalog: search box, archive toggle, "new product" button,
 * and the scrollable product list. Presentational — query/list state lives in the page.
 */
export function ProductList({
  products,
  loading,
  total,
  selectedId,
  query,
  includeArchived,
  onQueryChange,
  onSearch,
  onIncludeArchivedChange,
  onSelect,
  onStartCreate,
}: ProductListProps) {
  return (
    <section className="min-h-0 border-b border-[#2E2822] bg-[#12100D] lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2 border-b border-[#2E2822] p-4">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSearch();
          }}
          placeholder="SKU, название, категория"
          className={inputCls}
        />
        <button
          type="button"
          onClick={onSearch}
          className="h-[42px] rounded-[10px] bg-lime px-4 text-sm font-bold text-lime-ink disabled:opacity-50"
          disabled={loading}
        >
          Найти
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-[#2E2822] px-4 py-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-[#A79C92]">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => onIncludeArchivedChange(event.target.checked)}
            className="h-4 w-4 accent-[#D7FF5C]"
          />
          С архивом
        </label>
        <button
          type="button"
          onClick={onStartCreate}
          className="rounded-[10px] bg-coral px-3 py-2 text-xs font-bold text-white transition hover:bg-deep"
        >
          + Новый товар
        </button>
      </div>
      <div className="h-full max-h-[42vh] overflow-y-auto lg:max-h-none">
        {loading && <div className="p-4 font-mono text-sm text-[#8A7F76]">Загрузка…</div>}
        {!loading && products.length === 0 && (
          <div className="p-6 text-sm text-[#8A7F76]">Нет товаров по текущему фильтру.</div>
        )}
        {!loading &&
          products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              className={`block w-full border-b border-[#221E19] px-4 py-3 text-left transition ${
                selectedId === product.id ? 'bg-[#221E19]' : 'hover:bg-[#1A1611]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{product.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-[#8A7F76]">{product.sku}</span>
                    <span className="rounded-chip bg-[#16130F] px-2 py-0.5 text-[11px] font-semibold text-lime">
                      {product.category}
                    </span>
                    {product.archived && (
                      <span className="rounded-chip bg-[#FF8A7A]/10 px-2 py-0.5 text-[11px] font-semibold text-[#FF8A7A]">
                        архив
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold tabular text-white">{som(product.price)}</div>
                  <div className="mt-1 text-[11px] text-[#8A7F76]">остаток {product.availableUnits}</div>
                </div>
              </div>
            </button>
          ))}
      </div>
      <div className="border-t border-[#2E2822] px-4 py-3 text-[11px] text-[#6E645C]">
        Показано {products.length} из {total}
      </div>
    </section>
  );
}
