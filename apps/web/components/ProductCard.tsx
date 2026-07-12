'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, Scale, ShoppingCart, Star } from 'lucide-react';
import { useState } from 'react';
import type { CatalogProduct } from '@/lib/api';
import { conditionLabel, som } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { useCompare } from '@/lib/compare';

const IMAGE_BY_KIND: Array<[RegExp, string]> = [
  [/(macbook|ноут|laptop)/i, '/products/p-macbook.png'],
  [/(airpods|науш|audio|аудио)/i, '/products/p-airpods.png'],
  [/(watch|час)/i, '/products/p-watch.png'],
  [/(ipad|планш)/i, '/products/p-ipad.png'],
  [/(samsung|galaxy)/i, '/products/p-samsung.png'],
];

export function productImage(product: CatalogProduct) {
  const haystack = `${product.name} ${product.category}`;
  return IMAGE_BY_KIND.find(([pattern]) => pattern.test(haystack))?.[1] ?? '/products/p-iphone.png';
}

export function ProductCard({ product }: { product: CatalogProduct }) {
  const { add } = useCart();
  const { has, toggle } = useFavorites();
  const compare = useCompare();
  const [added, setAdded] = useState(false);
  const condition = conditionLabel(product.attrs);
  const inStock = product.availableUnits > 0;
  const href = `/product/${product.id}`;

  function addToCart() {
    add({ id: product.id, sku: product.sku, name: product.name, price: product.price });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <article className="store-card-enter group relative flex min-w-0 flex-col rounded-[10px] border border-[#e5e5e7] bg-white p-3 transition duration-200 hover:-translate-y-0.5 hover:border-[#d2d2d7] hover:shadow-[0_8px_24px_rgba(0,0,0,.07)] active:scale-[0.99]">
      <div className="relative aspect-square overflow-hidden rounded-[7px] bg-white">
        <Link href={href} className="absolute inset-0" aria-label={product.name}>
          <Image src={productImage(product)} alt={product.name} fill sizes="(max-width: 700px) 50vw, 260px" className="object-contain p-3 transition duration-300 group-hover:scale-[1.04]" />
        </Link>
        <span className="absolute left-1 top-1 rounded-[4px] bg-[#fff2ef] px-2 py-1 text-[10px] font-bold text-[#ff4d2e]">{condition}</span>
        <button type="button" onClick={() => toggle(product.id)} aria-label={has(product.id) ? 'Удалить из избранного' : 'Добавить в избранное'} className={`absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-[8px] bg-white/90 ${has(product.id) ? 'text-[#ff4d2e]' : 'text-[#8a8a8a] hover:text-[#0f0f0f]'}`}>
          <Heart size={17} fill={has(product.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="flex flex-1 flex-col pt-2">
        <div className="flex items-center gap-1 text-[11px] text-[#8a8a8a]">
          <Star size={12} className="text-[#ffb800]" fill="currentColor" />
          <span>4.9</span><span>·</span><span>{Math.max(12, product.availableUnits * 17)} отзывов</span>
        </div>
        <Link href={href} className="mt-1.5 min-h-[38px] text-[13px] font-medium leading-[1.4] text-[#0f0f0f] transition hover:text-[#ff4d2e]">{product.name}</Link>
        <div className="mt-2 flex flex-wrap gap-1">{Object.values(product.attrs ?? {}).filter((value) => typeof value === 'string' || typeof value === 'number').slice(0, 3).map((value, index) => <span key={`${value}-${index}`} className="rounded-[4px] bg-[#f5f5f7] px-2 py-1 text-[10px] text-[#4a4a4a]">{String(value)}</span>)}</div>
        <div className={`mt-2 flex items-center gap-1 text-[11px] ${inStock ? 'text-[#00a046]' : 'text-[#8a8a8a]'}`}><span className="text-[8px]">●</span>{inStock ? `В наличии · ${product.availableUnits} шт.` : 'Под заказ'}</div>
        <div className="mt-2 text-[18px] font-extrabold text-[#0f0f0f]">{som(product.price)}</div>
        <div className="mt-1 text-[11px] text-[#8a8a8a]">В рассрочку <b className="font-semibold text-[#00a046]">от {som(Math.round(product.price / 12))}/мес</b></div>
        <div className="mt-auto flex gap-1.5 pt-3">
          <button type="button" disabled={!inStock} onClick={addToCart} className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-xs font-bold transition disabled:cursor-not-allowed disabled:bg-[#e5e5e7] disabled:text-[#8a8a8a] ${added ? 'bg-[#00a046] text-white' : 'bg-[#0f0f0f] text-white hover:bg-[#ff4d2e]'}`}>
            <ShoppingCart size={14} />{added ? 'Добавлено' : 'В корзину'}
          </button>
          <button type="button" onClick={() => compare.toggle(product.id)} aria-label={compare.has(product.id) ? 'Удалить из сравнения' : 'Добавить к сравнению'} className={`grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-[#f5f5f7] ${compare.has(product.id) ? 'text-[#ff4d2e]' : 'text-[#4a4a4a] hover:bg-[#e5e5e7]'}`}>
            <Scale size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
