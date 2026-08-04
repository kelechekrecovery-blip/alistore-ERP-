import type { CatalogProduct } from '@/lib/api';

/**
 * Чистые помощники по картинкам товара — без 'use client', чтобы их можно было
 * звать и из серверных компонентов.
 *
 * Жили в `components/ProductCard.tsx` (модуль с 'use client'), а серверный
 * `app/product/[id]/page.tsx` дёргал `productImage` в `generateMetadata` — и
 * Next бросал «Attempted to call productImage() from the server but productImage
 * is on the client», роняя SSR карточки товара (а с ней каталог и чекаут в e2e).
 * Функции чистые (читают только `product.attrs`), поэтому им место в общем
 * модуле, а не в клиентском.
 */

/** Абсолютный https или локальный путь (но не protocol-relative `//`). */
export function validMediaUrl(value: unknown): value is string {
  return typeof value === 'string' && ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('https://'));
}

export function productImages(product: CatalogProduct): string[] {
  const attrs = product.attrs ?? {};
  const media = Array.isArray(attrs.media) ? attrs.media.filter(validMediaUrl) : [];
  const candidates = [attrs.imageUrl, attrs.image, ...media].filter(validMediaUrl);
  return [...new Set(candidates)];
}

export function productImage(product: CatalogProduct): string | null {
  return productImages(product)[0] ?? null;
}
