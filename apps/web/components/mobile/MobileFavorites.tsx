'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { productImage } from '@/components/ProductCard';
import { som } from '@/lib/format';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useFavorites } from '@/lib/favorites';
import { useCart } from '@/lib/cart';

export default function MobileFavorites() {
  const favorites = useFavorites();
  const { add } = useCart();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 100 })
      .then((response) => setProducts(response.items))
      .catch(() => setProducts([]));
  }, []);

  const items = useMemo(
    () => (products ?? []).filter((p) => favorites.has(p.id)),
    [products, favorites],
  );

  return (
    <MobileFrame active="favorites">
      <div className="px-4 pb-6 pt-1">
        <div className="mb-3.5 font-display text-[20px] font-bold text-white">Избранное</div>

        {products === null ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-[98px] animate-pulse rounded-[14px] border border-surface-3 bg-surface-2" />
            ))}
          </div>
        ) : items.length > 0 ? (
          items.map((p) => {
            const inStock = p.availableUnits > 0;
            return (
              <div key={p.id} className="mb-2.5 flex gap-3 rounded-[14px] border border-surface-3 bg-surface-2 p-3">
                <Link
                  href={`/product/${p.id}`}
                  className="relative h-[74px] w-[74px] flex-shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2A2620] to-ink-dark"
                >
                  {productImage(p) ? <Image src={productImage(p)!} alt={p.name} fill sizes="74px" className="object-contain p-1.5" /> : <span className="grid h-full place-items-center text-lg font-bold text-subtle">{p.name.slice(0,1)}</span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/product/${p.id}`} className="block text-[13px] font-semibold text-white">
                    {p.name}
                  </Link>
                  <div className="mt-1 font-display text-[15px] font-extrabold text-white">{som(p.price)}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: inStock ? '#8A7F76' : '#E5B23C' }}>
                    {inStock ? `${p.availableUnits} в наличии` : 'под заказ'}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={!inStock}
                      onClick={() => add({ id: p.id, sku: p.sku, name: p.name, price: p.price, stockLimit: p.availableUnits })}
                      className={`rounded-[8px] px-3 py-1.5 text-[12px] font-bold ${
                        inStock ? 'bg-lime text-lime-ink' : 'bg-surface-3 text-faint'
                      }`}
                    >
                      В корзину
                    </button>
                    <button
                      type="button"
                      onClick={() => favorites.toggle(p.id)}
                      className="rounded-[8px] bg-surface-3 px-3 py-1.5 text-[12px] text-muted"
                    >
                      Убрать
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : favorites.hydrated ? (
          <div className="py-12 text-center">
            <div className="text-5xl">🤍</div>
            <div className="mt-3.5 font-display text-[17px] font-bold text-white">Пока пусто</div>
            <div className="mt-2 text-[13px] leading-[1.5] text-muted">
              Сохраняйте товары, чтобы не потерять и следить за ценой
            </div>
            <Link href="/catalog" className="mt-4 inline-block rounded-[11px] bg-lime px-[22px] py-3 text-[13px] font-bold text-lime-ink">
              В каталог
            </Link>
          </div>
        ) : null}
      </div>
    </MobileFrame>
  );
}
