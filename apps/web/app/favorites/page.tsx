'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileFavorites from '@/components/mobile/MobileFavorites';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useFavorites } from '@/lib/favorites';

export default function FavoritesPage() {
  const favorites = useFavorites();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  useEffect(() => { fetchCatalog({ limit: 100 }).then((response) => setProducts(response.items)).catch(() => setProducts([])); }, []);
  const items = useMemo(() => (products ?? []).filter((product) => favorites.has(product.id)), [products, favorites]);

  return <>
    <div className="md:hidden"><MobileFavorites /></div>
    <div className="hidden min-h-screen bg-sand text-ink font-sans md:block"><SiteHeader /><main className="mx-auto min-h-[620px] max-w-[1400px] px-5 py-10"><div className="text-xs text-slate">Главная / Избранное</div><h1 className="mt-3 text-[34px] font-extrabold">Избранное</h1><p className="mt-2 text-steel">Сохранённые товары и актуальные цены.</p>{products === null ? <div className="mt-10 text-slate">Загрузка...</div> : items.length ? <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="mt-10 grid min-h-[330px] place-items-center rounded-[12px] border border-mist bg-white text-center"><div><Heart className="mx-auto text-slate" size={38} /><h2 className="mt-5 text-2xl font-bold">Пока пусто</h2><p className="mt-2 text-steel">Сохраняйте товары, чтобы быстро вернуться к ним.</p><Link href="/catalog" className="mt-6 inline-flex rounded-[9px] bg-coral px-6 py-3 text-sm font-bold text-white">Открыть каталог</Link></div></div>}</main><SiteFooter /></div>
  </>;
}
