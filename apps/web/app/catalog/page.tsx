import type { Metadata } from 'next';
import { Suspense } from 'react';
import CatalogPage from './CatalogClient';
import { JsonLdScript } from '@/components/JsonLdScript';
import { fetchCatalog, fetchCatalogCategories, isCatalogUnavailable, type CatalogProduct } from '@/lib/api';
import { CATALOG_PAGE_SIZE } from '@/lib/catalog-view';
import { SITE_URL } from '@/lib/site';

/**
 * Серверная оболочка каталога.
 *
 * Раньше каталог был клиентским целиком: в HTML не приходило ни одной ссылки на
 * товар — покупатель ждал JS, а роботы, которые его не выполняют, видели пустую
 * страницу. Теперь первая выборка делается здесь и уезжает в разметку, а клиент
 * получает её готовой и не повторяет запрос на старте.
 *
 * Число обращений к API от этого не выросло: запрос переехал с клиента на
 * сервер. Маршрут при этом всё равно динамический — `fetchCatalog` ходит с
 * `cache: 'no-store'`, чтобы наличие не показывалось из кэша.
 */

const TITLE = 'Каталог техники — AliStore';
const DESCRIPTION =
  'Смартфоны, ноутбуки, планшеты, аудио, часы и телевизоры в наличии в Бишкеке. Новое и проверенное Б/У с гарантией AliStore.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Фильтры и поиск — состояния одной страницы, а не отдельные документы:
  // canonical сводит `?q=`/`?category=` к каталогу и не плодит дубли в выдаче.
  alternates: { canonical: `${SITE_URL}/catalog` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/catalog`,
    siteName: 'AliStore',
    locale: 'ru_RU',
    type: 'website',
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = firstValue(params.q);
  const category = firstValue(params.category);

  // Отказ каталога не подменяется пустотой: клиент получает `null` и сам
  // покажет свой экран ошибки с кнопкой «Повторить», как и раньше.
  const [initial, categories] = await Promise.all([
    loadFirstPage({ q, category }),
    fetchCatalogCategories()
      .then((items) => items.map((item) => item.category))
      .catch(() => []),
  ]);

  return (
    <>
      {initial && initial.items.length > 0 && <JsonLdScript data={itemListJsonLd(initial.items)} />}
      {/* `useSearchParams` внутри клиента требует границы Suspense. */}
      <Suspense>
        <CatalogPage
          initialProducts={initial?.items ?? null}
          initialTotal={initial?.total ?? 0}
          initialCategories={categories}
        />
      </Suspense>
    </>
  );
}

/** Ровно та выборка, которую клиент считает первой страницей при этих фильтрах. */
async function loadFirstPage({ q, category }: { q?: string; category?: string }) {
  try {
    const response = await fetchCatalog({
      q: q?.trim() || undefined,
      category: category && category !== 'Все' ? category : undefined,
      sort: 'stock_desc',
      limit: CATALOG_PAGE_SIZE,
      offset: 0,
    });
    return isCatalogUnavailable(response) ? null : response;
  } catch {
    return null;
  }
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Список товаров той же выборки, что отрисована на странице. */
function itemListJsonLd(items: CatalogProduct[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/product/${product.id}`,
      name: product.name,
    })),
  };
}
