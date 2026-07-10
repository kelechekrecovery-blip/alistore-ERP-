'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useFavorites } from '@/lib/favorites';

export default function FavoritesPage() {
  const favorites = useFavorites();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  useEffect(() => { fetchCatalog({ limit: 100 }).then((response) => setProducts(response.items)).catch(() => setProducts([])); }, []);
  const items = useMemo(() => (products ?? []).filter((product) => favorites.has(product.id)), [products, favorites]);

  return <div className="min-h-screen bg-[#0c0c17] text-[#f6f7fb]"><SiteHeader /><main className="mx-auto min-h-[620px] w-[min(1200px,92vw)] py-10 sm:py-14"><div className="text-xs text-[#6c7080]">Главная / Избранное</div><h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Избранное</h1><p className="mt-3 text-[#a2a6b6]">Сохранённые товары и актуальные цены.</p>{products === null ? <div className="mt-10 text-[#6c7080]">Загрузка...</div> : items.length ? <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="mt-10 grid min-h-[330px] place-items-center rounded-[22px] border border-white/[0.09] bg-white/[0.035] text-center"><div><Heart className="mx-auto text-[#6c7080]" size={38} /><h2 className="mt-5 font-display text-2xl font-bold">Пока пусто</h2><p className="mt-2 text-[#a2a6b6]">Сохраняйте товары, чтобы быстро вернуться к ним.</p><Link href="/catalog" className="mt-6 inline-flex rounded-full bg-[#f97316] px-6 py-3 text-sm font-bold text-[#180f02]">Открыть каталог</Link></div></div>}</main><SiteFooter /></div>;
}
