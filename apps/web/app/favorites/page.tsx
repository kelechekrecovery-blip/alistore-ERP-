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
    <div className="hidden min-h-screen bg-[#f5f5f7] text-[#0f0f0f] [font-family:Manrope,-apple-system,BlinkMacSystemFont,sans-serif] md:block"><SiteHeader /><main className="mx-auto min-h-[620px] max-w-[1400px] px-5 py-10"><div className="text-xs text-[#8a8a8a]">Главная / Избранное</div><h1 className="mt-3 text-[34px] font-extrabold">Избранное</h1><p className="mt-2 text-[#4a4a4a]">Сохранённые товары и актуальные цены.</p>{products === null ? <div className="mt-10 text-[#8a8a8a]">Загрузка...</div> : items.length ? <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="mt-10 grid min-h-[330px] place-items-center rounded-[12px] border border-[#e5e5e7] bg-white text-center"><div><Heart className="mx-auto text-[#8a8a8a]" size={38} /><h2 className="mt-5 text-2xl font-bold">Пока пусто</h2><p className="mt-2 text-[#4a4a4a]">Сохраняйте товары, чтобы быстро вернуться к ним.</p><Link href="/catalog" className="mt-6 inline-flex rounded-[9px] bg-[#ff4d2e] px-6 py-3 text-sm font-bold text-white">Открыть каталог</Link></div></div>}</main><SiteFooter /></div>
  </>;
}
