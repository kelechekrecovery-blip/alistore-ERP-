import type { Metadata } from 'next';
import HomePage from './HomeClient';
import { JsonLdScript } from '@/components/JsonLdScript';
import {
  fetchCatalog,
  fetchPublicStorefrontBlocks,
  fetchStorefrontContent,
  isCatalogUnavailable,
  type CatalogProduct,
  type StorefrontBlock,
  type StorefrontPayload,
} from '@/lib/api';
import { SITE_URL } from '@/lib/site';

/**
 * Серверная оболочка главной.
 *
 * Раньше страница была клиентской целиком: герой, преимущества и подборка
 * приходили через `useEffect`, поэтому в первичном HTML их не было вовсе —
 * робот получал пустую оболочку, а покупатель ждал JS. Метаданные из модуля с
 * 'use client' тоже не экспортируются, так что у главной не было ни canonical,
 * ни Open Graph.
 *
 * Теперь первая выборка делается здесь и уезжает в разметку, а клиент получает
 * её пропсами и не повторяет запрос на старте. Число обращений к API не выросло:
 * они переехали с клиента на сервер — тот же приём, что уже применён в
 * `app/catalog/page.tsx`.
 */

const TITLE = 'AliStore — электроника с гарантией в Кыргызстане';
const DESCRIPTION =
  'Смартфоны, ноутбуки, планшеты, аудио и часы в Бишкеке: новое и Б/У привозное с гарантией, проверкой по IMEI, рассрочкой 0% и trade-in.';
const OG_IMAGE = '/products/banner-hero.png';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'AliStore',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: OG_IMAGE }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
};

export default async function Page() {
  const initial = await loadFirstScreen();

  return (
    <>
      <JsonLdScript data={ORGANIZATION_JSON_LD} />
      <JsonLdScript data={WEB_SITE_JSON_LD} />
      <HomePage
        initialStorefront={initial.storefront}
        initialBlocks={initial.blocks}
        initialProducts={initial.products}
      />
    </>
  );
}

interface FirstScreen {
  storefront: StorefrontPayload | null;
  blocks: StorefrontBlock[];
  products: CatalogProduct[] | null;
}

/**
 * Ровно то, что клиент раньше собирал сам в первом `useEffect`: витрина,
 * опубликованные десктопные блоки и подборка — из CMS, а если владелец её не
 * задал, то первые позиции каталога.
 *
 * `products: null` означает «сервер не смог», а не «товаров нет»: клиент по
 * этому признаку сходит за данными сам и покажет честный экран сбоя вместо
 * пустого магазина.
 */
async function loadFirstScreen(): Promise<FirstScreen> {
  const [storefront, blocks] = await Promise.all([
    fetchStorefrontContent(),
    fetchPublicStorefrontBlocks('desktop'),
  ]);

  if (storefront === null) return { storefront: null, blocks, products: null };
  if (storefront.featuredProducts.length > 0) {
    return { storefront, blocks, products: storefront.featuredProducts };
  }

  try {
    const catalog = await fetchCatalog({ limit: 12, sort: 'stock_desc' });
    return { storefront, blocks, products: isCatalogUnavailable(catalog) ? null : catalog.items };
  } catch {
    return { storefront, blocks, products: null };
  }
}

/**
 * Только то, что известно наверняка: имя, адрес сайта и логотип. Телефон и
 * адрес магазина живут в CMS и меняются владельцем — вшивать их сюда значит
 * рано или поздно отдавать поисковику устаревший контакт.
 */
const ORGANIZATION_JSON_LD: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AliStore',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
};

/**
 * `SearchAction` ведёт на каталог, а не на `/search`: последний лишь редиректит
 * на `/catalog?q=` с тем же параметром (`app/search/page.tsx`), а каталог этот
 * `q` действительно читает (`CatalogClient.tsx`) — то есть обещание выполнимо.
 */
const WEB_SITE_JSON_LD: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AliStore',
  url: SITE_URL,
  inLanguage: 'ru-RU',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/catalog?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};
