'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { CatalogProduct } from '@/lib/api';
import { som } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { useCompare } from '@/lib/compare';
import { productImage } from '@/components/ProductCard';
import { ImageOff } from 'lucide-react';

interface MobileProductCardProps {
  product: CatalogProduct;
  badge?: string;
  priority?: boolean;
  /** Show the ⇄ compare toggle beside the add button (catalog grid). */
  showCompare?: boolean;
}

/**
 * Mobile hits/catalog product card (Клиент App 2.0): real product thumbnail with an
 * optional badge + favourite toggle, name, Sora price, stock line, a lime add button and
 * an optional compare toggle.
 */
export function MobileProductCard({ product, badge, priority = false, showCompare = false }: MobileProductCardProps) {
  const { add } = useCart();
  const { has, toggle } = useFavorites();
  const compare = useCompare();
  const [added, setAdded] = useState(false);
  const inStock = product.availableUnits > 0;
  const href = `/product/${product.id}`;

  function addToCart() {
    if (!inStock) return;
    add({ id: product.id, sku: product.sku, name: product.name, price: product.price, stockLimit: product.availableUnits });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <motion.div
      className="overflow-hidden rounded-[16px] border border-surface-3 bg-surface-2"
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={href} className="relative block h-[120px] bg-gradient-to-br from-[#2A2620] to-ink-dark">
        {productImage(product) ? <Image src={productImage(product)!} alt={product.name} fill sizes="200px" priority={priority} className="object-contain p-3" /> : <span className="flex h-full flex-col items-center justify-center gap-1 text-[10px] text-subtle"><ImageOff size={24} /><span>Фото готовится</span></span>}
        {badge && (
          <span className="absolute left-2 top-2 rounded-[6px] bg-coral px-1.5 py-[3px] text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggle(product.id);
          }}
          aria-label={has(product.id) ? 'Убрать из избранного' : 'В избранное'}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-lime-ink/60 text-sm"
        >
          <span className={has(product.id) ? 'text-coral' : 'text-white'}>{has(product.id) ? '♥' : '♡'}</span>
        </button>
      </Link>
      <div className="px-[11px] pb-3 pt-2.5">
        <Link href={href} className="block min-h-[34px] text-[13px] font-semibold leading-[1.3] text-white">
          {product.name}
        </Link>
        <div className="mt-1.5 font-display text-[16px] font-extrabold text-white">{som(product.price)}</div>
        <div className="mt-0.5 text-[10px] text-subtle">
          {inStock ? `${product.availableUnits} в наличии` : 'под заказ'}
        </div>
        <div className="mt-2.5 flex gap-1.5">
          <button
            type="button"
            onClick={addToCart}
            disabled={!inStock}
            className={`flex-1 rounded-[9px] py-2 text-center text-[12px] font-bold transition ${
              added
                ? 'bg-success text-white'
                : inStock
                  ? 'bg-lime text-lime-ink'
                  : 'bg-surface-3 text-faint'
            }`}
          >
            {added ? 'Добавлено ✓' : inStock ? 'В корзину' : 'Под заказ'}
          </button>
          {showCompare && (
            <button
              type="button"
              onClick={() => compare.toggle(product.id)}
              aria-label={compare.has(product.id) ? 'Убрать из сравнения' : 'Сравнить'}
              className={`grid w-[34px] place-items-center rounded-[9px] text-sm transition ${
                compare.has(product.id) ? 'bg-lime text-lime-ink' : 'bg-surface-3 text-subtle'
              }`}
            >
              ⇄
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
