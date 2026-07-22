import type { Metadata } from 'next';
import ProductPage from './ProductClient';
import { JsonLdScript } from '@/components/JsonLdScript';
import { fetchProductWithRelated, type CatalogProduct } from '@/lib/api';
import { productImage, productImages } from '@/lib/product-image';
import { som } from '@/lib/format';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

const FALLBACK_TITLE = 'Товар не найден — AliStore';
const FALLBACK_DESCRIPTION = 'Товар не найден или временно недоступен в каталоге AliStore.';

/**
 * Server-side metadata for social/search previews. Reads the same catalog source
 * as the client page (`fetchProductWithRelated`), so a missing/unavailable
 * product degrades to an honest generic fallback instead of a thrown error or a
 * fabricated title/image.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { product } = await fetchProductWithRelated(id).catch(() => ({ product: null }));
  if (!product) {
    return { title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION };
  }

  const title = `${product.name} — купить в AliStore`;
  const attrsDescription = product.attrs?.description;
  const providedDescription =
    typeof attrsDescription === 'string' ? attrsDescription.trim() : '';
  const rawDescription =
    providedDescription ||
    `${product.name} за ${som(product.price)} в AliStore: гарантия, проверка по IMEI, самовывоз и доставка по Кыргызстану.`;
  const description =
    rawDescription.length > 200 ? `${rawDescription.slice(0, 197).trimEnd()}…` : rawDescription;
  const url = `${SITE_URL}/product/${product.id}`;
  // Honest fallback: no image means no `images` field, not an invented placeholder.
  const image = productImage(product);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'AliStore',
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Тот же вызов, что и в `generateMetadata`: `fetchProductWithRelated` держит
  // TTL-кэш промиса по id, поэтому второго обращения к API здесь не возникает.
  const { product } = await fetchProductWithRelated(id).catch(() => ({ product: null }));

  return (
    <>
      {product && <JsonLdScript data={productJsonLd(product)} />}
      {product?.category && <JsonLdScript data={breadcrumbJsonLd(product)} />}
      <ProductPage params={{ id }} />
    </>
  );
}

/**
 * Product + Offer для поисковой выдачи. Раньше строился в `ProductClient.tsx`
 * (клиентский модуль) и появлялся только после гидратации — то есть для робота
 * его не было вовсе. Цена и наличие берутся из того же ответа каталога, что и
 * видимая карточка, чтобы разметка не расходилась с экраном.
 */
function productJsonLd(product: CatalogProduct): Record<string, unknown> {
  const images = productImages(product);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    ...(images.length > 0 ? { image: images } : {}),
    category: product.category,
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/product/${product.id}`,
      price: product.price,
      priceCurrency: 'KGS',
      availability: product.availableUnits > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
}

function breadcrumbJsonLd(product: CatalogProduct): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${SITE_URL}/catalog` },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.category,
        item: `${SITE_URL}/catalog?category=${encodeURIComponent(product.category)}`,
      },
      { '@type': 'ListItem', position: 4, name: product.name, item: `${SITE_URL}/product/${product.id}` },
    ],
  };
}
