'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Heart, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import type { CatalogProduct } from '@/lib/api';
import { conditionLabel, som } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';

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
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/[0.09] bg-white/[0.035] transition duration-300 hover:-translate-y-1 hover:border-white/[0.18] hover:bg-white/[0.055]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_15%,rgba(249,115,22,.12),transparent_50%),linear-gradient(150deg,#191932,#101021)]">
        <Link href={href} className="absolute inset-0" aria-label={product.name}>
          <Image src={productImage(product)} alt={product.name} fill sizes="(max-width: 700px) 50vw, 280px" className="object-contain p-5 transition duration-500 group-hover:scale-[1.06]" />
        </Link>
        <span className="absolute left-3 top-3 rounded-full border border-[#f97316]/30 bg-[#f97316]/15 px-2.5 py-1 text-[11px] font-semibold text-[#fb9a4b]">{condition}</span>
        <button type="button" onClick={() => toggle(product.id)} aria-label={has(product.id) ? 'Удалить из избранного' : 'Добавить в избранное'} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.09] bg-[#0c0c17]/70 backdrop-blur ${has(product.id) ? 'text-[#f97316]' : 'text-[#a2a6b6] hover:text-white'}`}>
          <Heart size={17} fill={has(product.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate uppercase tracking-[0.08em] text-[#6c7080]">{product.category}</span>
          <span className={inStock ? 'text-[#7ee2a0]' : 'text-[#f4c27d]'}>{inStock ? `${product.availableUnits} в наличии` : 'Под заказ'}</span>
        </div>
        <Link href={href} className="mt-2 min-h-[44px] text-[15px] font-medium leading-[1.45] text-[#f6f7fb] transition hover:text-[#fb9a4b]">{product.name}</Link>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <div className="font-display text-xl font-bold text-white">{som(product.price)}</div>
            <div className="mt-1 text-[11px] text-[#6c7080]">+{Math.max(1, Math.floor(product.price / 100))} бонусов</div>
          </div>
          <button type="button" disabled={!inStock} onClick={addToCart} title={added ? 'Добавлено' : 'В корзину'} className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] transition disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-[#5f6372] ${added ? 'bg-[#22c55e] text-white' : 'bg-[#f97316] text-[#180f02] hover:bg-[#fb9a4b]'}`}>
            <ShoppingBag size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
