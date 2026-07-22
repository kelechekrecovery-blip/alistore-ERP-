import type { Metadata } from 'next';
import ProductPage from './ProductClient';
import { fetchProductWithRelated } from '@/lib/api';
import { productImage } from '@/components/ProductCard';
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
  return <ProductPage params={await params} />;
}
