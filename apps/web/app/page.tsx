import type { Metadata } from 'next';
import HomePage from './HomeClient';
import { JsonLdScript } from '@/components/JsonLdScript';
import { SITE_URL } from '@/lib/site';

/**
 * Серверная оболочка главной. Сама страница осталась клиентской
 * (`HomeClient.tsx`) — она тянет витрину и подборку через `useEffect`. Но из
 * модуля с 'use client' нельзя экспортировать `metadata`, поэтому у главной не
 * было ни canonical, ни Open Graph — только общий заголовок корневого layout.
 * Разметка организации и сайта отдаётся отсюда же: роботы не выполняют JS.
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

export default function Page() {
  return (
    <>
      <JsonLdScript data={ORGANIZATION_JSON_LD} />
      <JsonLdScript data={WEB_SITE_JSON_LD} />
      <HomePage />
    </>
  );
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
