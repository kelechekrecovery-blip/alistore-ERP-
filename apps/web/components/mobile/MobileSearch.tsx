'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LoadFailure } from '@/components/LoadFailure';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { fetchCatalog, isCatalogUnavailable, type CatalogProduct } from '@/lib/api';

const POPULAR = ['iPhone', 'Samsung', 'AirPods', 'MacBook', 'iPad', 'Часы'];

export default function MobileSearch() {
  const router = useRouter();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get('q') ?? '');
    fetchCatalog({ limit: 100 })
      .then((response) => { if (isCatalogUnavailable(response)) throw new Error('Каталог не ответил'); return response; })
      .then((response) => setProducts(response.items))
      .catch((cause: unknown) => {
      // Пустой список и упавший запрос — разные экраны. Раньше сбой показывал
      // покупателю то же, что видит владелец пустого магазина.
      setProducts(null);
      setLoadError(cause instanceof Error && cause.message ? cause.message : ' ');
    });
  }, [reloadToken]);

  const results = useMemo(() => {
    const query = q.trim().toLocaleLowerCase('ru');
    if (!query) return [];
    return (products ?? []).filter((p) =>
      `${p.name} ${p.sku} ${p.category}`.toLocaleLowerCase('ru').includes(query),
    );
  }, [products, q]);

  const trimmed = q.trim();

  return (
    <MobileFrame active="catalog" header={false}>
      <div className="px-4 pb-6 pt-2">
        {/* search bar */}
        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Назад" className="text-[20px] text-white">
            ←
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-[13px] border border-surface-3 bg-surface-2 px-3.5 py-2.5">
            <span className="text-faint">🔍</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск техники, брендов…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Очистить" className="text-faint">
                ✕
              </button>
            )}
          </div>
        </div>

        {!trimmed ? (
          <>
            <div className="mb-2.5 text-[13px] text-subtle">Популярные запросы</div>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQ(term)}
                  className="rounded-full border border-surface-3 bg-surface-2 px-3.5 py-2 text-xs text-bright"
                >
                  {term}
                </button>
              ))}
            </div>
          </>
        ) : results.length > 0 ? (
          <>
            <div className="mb-2.5 text-[13px] text-subtle">Найдено: {results.length}</div>
            <div className="grid grid-cols-2 gap-3">
              {results.slice(0, 20).map((p, i) => (
                <MobileProductCard key={p.id} product={p} priority={i === 0} />
              ))}
            </div>
          </>
        ) : loadError !== '' ? <LoadFailure what="товары" detail={loadError.trim()} onRetry={() => { setLoadError(''); setReloadToken((value) => value + 1); }} /> : products === null ? (
          <div className="py-10 text-center text-sm text-subtle">Поиск…</div>
        ) : (
          <div className="py-12 text-center">
            <div className="text-5xl">🔍</div>
            <div className="mt-3.5 font-display text-[17px] font-bold text-white">Ничего не найдено</div>
            <div className="mt-2 text-[13px] text-muted">Попробуйте другой запрос</div>
            <Link href="/catalog" className="mt-4 inline-block rounded-[11px] bg-lime px-5 py-2.5 text-[13px] font-bold text-lime-ink">
              Открыть каталог
            </Link>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
