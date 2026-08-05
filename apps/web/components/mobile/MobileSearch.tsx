'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, SearchX } from 'lucide-react';
import { LoadFailure } from '@/components/LoadFailure';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { fetchCatalog, isCatalogUnavailable, type CatalogProduct } from '@/lib/api';
import { searchSummary } from '@/lib/search-summary';

const POPULAR = ['iPhone', 'Samsung', 'AirPods', 'MacBook', 'iPad', 'Часы'];
/** Сколько карточек показываем; сервер сообщает, сколько нашлось всего. */
const PAGE_SIZE = 20;
/** Пауза после последнего нажатия — чтобы набор слова не бил в API посимвольно. */
const TYPING_PAUSE_MS = 250;

export default function MobileSearch() {
  const router = useRouter();
  const [results, setResults] = useState<CatalogProduct[] | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get('q') ?? '');
  }, []);

  // Порядковый номер запроса: ответы приходят вразнобой, и медленный ответ по
  // «iPh» не должен затереть быстрый по «iPhone». Сравниваем номер перед тем,
  // как что-то записать в состояние.
  const requestSeq = useRef(0);
  const trimmed = q.trim();

  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      setTotal(undefined);
      setLoadError('');
      return;
    }
    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      // Ищет сервер по всему каталогу. Раньше страница тянула первые сто
      // товаров и фильтровала их в браузере: товар со сто первой позиции
      // «не существовал», а подпись «Найдено» считала по этой же сотне.
      void fetchCatalog({ q: trimmed, limit: PAGE_SIZE })
        .then((response) => {
          if (isCatalogUnavailable(response)) throw new Error('Каталог не ответил');
          return response;
        })
        .then((response) => {
          if (seq !== requestSeq.current) return;
          setResults(response.items);
          setTotal(response.total);
          setLoadError('');
        })
        .catch((cause: unknown) => {
          if (seq !== requestSeq.current) return;
          // Пустой список и упавший запрос — разные экраны. Раньше сбой показывал
          // покупателю то же, что видит владелец пустого магазина.
          setResults(null);
          setTotal(undefined);
          setLoadError(cause instanceof Error && cause.message ? cause.message : ' ');
        });
    }, TYPING_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, reloadToken]);

  return (
    <MobileFrame active="catalog" header={false}>
      <div className="px-4 pb-6 pt-2">
        {/* search bar */}
        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Назад" className="text-[20px] text-white">
            ←
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-[13px] border border-surface-3 bg-surface-2 px-3.5 py-2.5">
            <Search size={16} className="text-faint" aria-hidden />
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
        ) : results && results.length > 0 ? (
          <>
            <div className="mb-2.5 text-[13px] text-subtle">{searchSummary({ total, shown: results.length })}</div>
            <div className="grid grid-cols-2 gap-3">
              {results.map((p, i) => (
                <MobileProductCard key={p.id} product={p} priority={i === 0} />
              ))}
            </div>
            {/* Найдено больше, чем поместилось: уводим в каталог с тем же
                запросом, а не оставляем покупателя гадать, где остальное. */}
            {typeof total === 'number' && total > results.length && (
              <Link
                href={`/catalog?q=${encodeURIComponent(trimmed)}`}
                className="mt-4 block rounded-[11px] border border-surface-3 bg-surface-2 py-3 text-center text-[13px] font-semibold text-white"
              >
                Показать все {total.toLocaleString('ru-RU')}
              </Link>
            )}
          </>
        ) : loadError !== '' ? <LoadFailure what="товары" detail={loadError.trim()} onRetry={() => { setLoadError(''); setReloadToken((value) => value + 1); }} /> : results === null ? (
          <div className="py-10 text-center text-sm text-subtle">Поиск…</div>
        ) : (
          <div className="py-12 text-center">
            <SearchX size={48} strokeWidth={1.4} aria-hidden className="mx-auto text-faint" />
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
