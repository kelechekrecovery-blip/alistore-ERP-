'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, ImageOff, Scale, ShoppingCart, Star } from 'lucide-react';
import { useState } from 'react';
import type { CatalogProduct } from '@/lib/api';
import { conditionLabel, som } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { useCompare } from '@/lib/compare';
// Чистые помощники по картинкам вынесены в неклиентский модуль, чтобы их мог
// звать серверный `generateMetadata`. Ре-экспорт сохранён для совместимости с
// существующими импортами из ProductCard.
import { productImage, productImages } from '@/lib/product-image';

export { productImage, productImages };

const PRESENTATION_ATTRS = new Set([
  'description',
  'deliverytext',
  'financingtext',
  'image',
  'imageurl',
  'media',
  'old_price',
  'oldprice',
  'pickuptext',
  'returnpolicy',
  'warranty',
]);

export function productSpecEntries(product: CatalogProduct): Array<[string, string | number]> {
  return Object.entries(product.attrs ?? {}).flatMap(([key, value]) => {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      PRESENTATION_ATTRS.has(key.toLowerCase())
    ) {
      return [];
    }
    return [[key, value] as [string, string | number]];
  });
}

export function ProductCard({ product, variant = 'light' }: { product: CatalogProduct; variant?: 'light' | 'design3' }) {
  const design3 = variant === 'design3';
  const { add } = useCart();
  const { has, toggle } = useFavorites();
  const compare = useCompare();
  const [added, setAdded] = useState(false);
  const condition = conditionLabel(product.attrs);
  const inStock = product.availableUnits > 0;
  const href = `/product/${product.id}`;

  function addToCart() {
    add({ id: product.id, sku: product.sku, name: product.name, price: product.price, stockLimit: product.availableUnits });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <article className={`store-card-enter group relative flex min-w-0 flex-col rounded-[16px] p-3 transition duration-200 hover:-translate-y-0.5 active:scale-[0.99] ${design3 ? 'border border-white/10 bg-gradient-to-br from-white/[.075] to-white/[.02] shadow-[0_10px_26px_rgba(0,0,0,.32)] backdrop-blur-xl hover:border-[#ff7a4d]/40 hover:shadow-[0_16px_34px_rgba(0,0,0,.44)]' : 'rounded-[10px] border border-linen bg-white hover:border-linen hover:shadow-[0_8px_24px_rgba(0,0,0,.07)]'}`}>
      <div className={`relative aspect-square overflow-hidden rounded-[11px] ${design3 ? 'bg-gradient-to-br from-[#ede6dc] to-[#d8cfc6]' : 'bg-white'}`}>
        <Link href={href} className="absolute inset-0" aria-label={product.name}>
          {productImage(product) ? <Image src={productImage(product)!} alt={product.name} fill sizes="(max-width: 700px) 50vw, 260px" className="object-contain p-3 transition duration-300 group-hover:scale-[1.04]" /> : <span className="flex h-full flex-col items-center justify-center gap-2 text-xs text-faint"><ImageOff size={28} /><span>Фото готовится</span></span>}
        </Link>
        <span className={`absolute left-1 top-1 rounded-[5px] px-2 py-1 text-[10px] font-bold ${design3 ? 'bg-[#c93a16] text-white' : 'bg-tint text-deep'}`}>{condition}</span>
        <button type="button" onClick={() => toggle(product.id)} aria-label={has(product.id) ? 'Удалить из избранного' : 'Добавить в избранное'} className={`absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full ${design3 ? 'bg-black/40 text-white/70' : 'bg-white/90'} ${has(product.id) ? 'text-coral' : 'text-faint hover:text-ink'}`}>
          <Heart size={17} fill={has(product.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="flex flex-1 flex-col pt-2">
        <div className={`flex min-h-4 items-center gap-1 text-[11px] ${design3 ? 'text-white/45' : 'text-faint'}`}>
          {product.reviewCount > 0 && product.avgRating !== null ? <><Star size={12} className="text-warn" fill="currentColor" /><span>{product.avgRating.toFixed(1)}</span><span>·</span><span>{product.reviewCount} отзывов</span></> : <span>Отзывов пока нет</span>}
        </div>
        <Link href={href} className={`mt-1.5 min-h-[38px] text-[13px] font-medium leading-[1.4] transition hover:text-coral ${design3 ? 'text-white' : 'text-ink'}`}>{product.name}</Link>
        <div className="mt-2 flex flex-wrap gap-1">{productSpecEntries(product).slice(0, 3).map(([key, value]) => <span key={key} className={`rounded-[4px] px-2 py-1 text-[10px] ${design3 ? 'bg-white/[.06] text-white/50' : 'bg-sand text-faint'}`}>{String(value)}</span>)}</div>
        <div className={`mt-2 flex items-center gap-1 text-[11px] ${inStock ? 'text-[#c6ff3d]' : design3 ? 'text-white/45' : 'text-faint'}`}><span className="text-[8px]">●</span>{inStock ? `В наличии · ${product.availableUnits} шт.` : 'Под заказ'}</div>
        <div className={`mt-2 font-display tabular text-[18px] font-extrabold ${design3 ? 'text-white' : 'text-ink'}`}>{som(product.price)}</div>
        {typeof product.attrs?.financingText === 'string' && <div className={`mt-1 text-[11px] ${design3 ? 'text-[#c6ff3d]' : 'text-faint'}`}>{product.attrs.financingText}</div>}
        <div className="mt-auto flex gap-1.5 pt-3">
          <button type="button" disabled={!inStock} onClick={addToCart} className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-xs font-bold transition disabled:cursor-not-allowed disabled:bg-linen disabled:text-faint ${added ? 'bg-success text-white' : 'bg-coral text-white hover:bg-deep'}`}>
            <ShoppingCart size={14} />{added ? 'Добавлено' : 'В корзину'}
          </button>
          <button type="button" onClick={() => compare.toggle(product.id)} aria-label={compare.has(product.id) ? 'Удалить из сравнения' : 'Добавить к сравнению'} className={`grid h-10 w-10 shrink-0 place-items-center rounded-[8px] ${design3 ? 'bg-white/[.06]' : 'bg-sand'} ${compare.has(product.id) ? 'text-coral' : 'text-faint hover:bg-linen'}`}>
            <Scale size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
