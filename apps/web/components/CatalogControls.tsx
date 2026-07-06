'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/**
 * Search + filters that persist to the URL (shareable state). Server component
 * re-fetches from searchParams — no client data store.
 */
export function CatalogControls({ categories }: { categories: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeCategory = params.get('category') ?? '';
  const stockOnly = params.get('stockOnly') === 'true';

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      startTransition(() => router.replace(`/?${next.toString()}`, { scroll: false }));
    },
    [params, router],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <input
          type="search"
          defaultValue={params.get('q') ?? ''}
          placeholder="Поиск: iPhone, MacBook, наушники…"
          aria-label="Поиск по каталогу"
          onChange={(e) => setParam('q', e.target.value.trim() || null)}
          className="w-full rounded-btn border border-ink/15 bg-white px-4 py-3 text-base text-ink shadow-soft outline-none transition placeholder:text-ink/35 focus:border-coral focus:ring-4 focus:ring-coral/15"
        />
        {pending && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-ink/40">
            …
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setParam('category', null)}
          className={chip(activeCategory === '')}
        >
          Все
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setParam('category', cat)}
            className={chip(activeCategory === cat)}
          >
            {cat}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={stockOnly}
            onChange={(e) => setParam('stockOnly', e.target.checked ? 'true' : null)}
            className="h-4 w-4 accent-coral"
          />
          Только в наличии
        </label>
      </div>
    </div>
  );
}

function chip(active: boolean): string {
  return [
    'rounded-chip px-3.5 py-1.5 text-sm font-medium transition',
    active
      ? 'bg-ink text-sand'
      : 'border border-ink/15 bg-white text-ink/70 hover:border-ink/30 hover:text-ink',
  ].join(' ');
}
