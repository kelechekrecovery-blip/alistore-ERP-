'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LoadFailure } from '@/components/LoadFailure';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileFavorites from '@/components/mobile/MobileFavorites';
import { fetchCatalog, isCatalogUnavailable, type CatalogProduct } from '@/lib/api';
import { useFavorites } from '@/lib/favorites';

export default function FavoritesPage() {
  const favorites = useFavorites();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((response) => { if (isCatalogUnavailable(response)) throw new Error('Каталог не ответил'); setProducts(response.items); }).catch((cause: unknown) => {
      // Пустое избранное и упавший запрос — разные экраны.
      setProducts(null);
      setLoadError(cause instanceof Error && cause.message ? cause.message : ' ');
    });
  }, [reloadToken]);
  const items = useMemo(() => (products ?? []).filter((product) => favorites.has(product.id)), [products, favorites]);

  return <>
    <div className="md:hidden"><MobileFavorites /></div>
    <div className="hidden min-h-screen bg-[#0b0a08] text-[#e5dcd3] font-sans md:block"><SiteHeader variant="design3" /><main className="mx-auto min-h-[620px] max-w-[1400px] px-5 py-10"><div className="text-xs text-white/40">Главная / Избранное</div><h1 className="mt-3 text-[34px] font-extrabold text-white">Избранное</h1><p className="mt-2 text-white/45">Сохранённые товары и актуальные цены.</p>{loadError !== '' ? <LoadFailure className="mt-10" what="избранное" detail={loadError.trim()} onRetry={() => { setLoadError(''); setReloadToken((value) => value + 1); }} /> : products === null ? <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="aspect-[.62] animate-pulse rounded-[12px] border border-white/10 bg-white/[.04]" />)}</div> : items.length ? <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((product) => <ProductCard key={product.id} product={product} variant="design3" />)}</div> : <div className="mt-10 grid min-h-[330px] place-items-center rounded-[12px] border border-white/10 bg-white/[.04] text-center"><div><Heart className="mx-auto text-white/40" size={38} /><h2 className="mt-5 text-2xl font-bold text-white">Пока пусто</h2><p className="mt-2 text-white/45">Сохраняйте товары, чтобы быстро вернуться к ним.</p><Link href="/catalog" className="mt-6 inline-flex rounded-[9px] bg-[#ff5b2e] px-6 py-3 text-sm font-bold text-white">Открыть каталог</Link></div></div>}</main><SiteFooter /></div>
  </>;
}
