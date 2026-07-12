'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileCatalog from '@/components/mobile/MobileCatalog';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';

const CONDITIONS = ['Все', 'Новое', 'Б/У'];

export default function CatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [condition, setCondition] = useState('Все');
  const [stockOnly, setStockOnly] = useState(false);
  const [sort, setSort] = useState('popular');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    setCategory(params.get('category') ?? 'Все');
    fetchCatalog({ limit: 100 }).then((response) => setProducts(response.items)).catch(() => setProducts([]));
  }, []);

  const categories = useMemo(() => ['Все', ...Array.from(new Set((products ?? []).map((product) => product.category))).sort()], [products]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru');
    const items = (products ?? []).filter((product) => {
      const attrs = product.attrs ?? {};
      const productCondition = String(attrs.condition ?? attrs.state ?? 'Новое');
      return (!q || `${product.name} ${product.sku} ${product.category}`.toLocaleLowerCase('ru').includes(q))
        && (category === 'Все' || product.category === category || product.category.toLocaleLowerCase('ru').includes(category.toLocaleLowerCase('ru')))
        && (condition === 'Все' || productCondition.toLocaleLowerCase('ru').includes(condition.toLocaleLowerCase('ru')))
        && (!stockOnly || product.availableUnits > 0);
    });
    return items.sort((a, b) => sort === 'price-asc' ? a.price - b.price : sort === 'price-desc' ? b.price - a.price : b.availableUnits - a.availableUnits);
  }, [products, query, category, condition, stockOnly, sort]);

  const reset = () => { setQuery(''); setCategory('Все'); setCondition('Все'); setStockOnly(false); setSort('popular'); };

  return <>
    <div className="md:hidden"><MobileCatalog /></div>
    <div className="hidden min-h-screen bg-sand text-ink md:block">
    <SiteHeader />
    <main className="mx-auto w-[min(1200px,92vw)] py-10">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><div className="text-xs text-[#8A7F76]">Главная / Каталог</div><h1 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">Каталог техники</h1><p className="mt-3 text-[#6E645C]">Новое и проверенное Б/У с гарантией AliStore</p></div>
        <div className="text-sm text-[#6E645C]">{products === null ? 'Загрузка...' : `${visible.length} товаров`}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[245px_1fr]">
        <aside className="h-fit rounded-[18px] border border-[#E7DDD3] bg-white p-5 shadow-soft lg:sticky lg:top-24">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-display font-semibold"><SlidersHorizontal size={17} /> Фильтры</h2><button type="button" onClick={reset} className="text-xs font-semibold text-deep">Сбросить</button></div>
          <FilterTitle>Категория</FilterTitle>
          <div className="grid gap-1">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-[9px] px-3 py-2 text-left text-sm ${category === item ? 'bg-tint font-semibold text-deep' : 'text-[#6E645C] hover:bg-[#F7F2EC] hover:text-ink'}`}>{item}</button>)}</div>
          <FilterTitle>Состояние</FilterTitle>
          <div className="flex flex-wrap gap-2">{CONDITIONS.map((item) => <button key={item} type="button" onClick={() => setCondition(item)} className={`rounded-[9px] border px-3 py-2 text-xs ${condition === item ? 'border-coral bg-coral text-white' : 'border-[#DED3C8] text-[#6E645C]'}`}>{item}</button>)}</div>
          <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-[#6E645C]"><input type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} className="h-4 w-4 accent-coral" /> Только в наличии</label>
        </aside>

        <section>
          <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-[#E7DDD3] bg-white p-3 shadow-soft sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center rounded-[11px] border border-[#DED3C8] bg-white px-3 focus-within:border-coral focus-within:ring-4 focus-within:ring-coral/10"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию, SKU и категории" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-[#A79C92]" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск" className="text-[#8A7F76]"><X size={17} /></button>}</div>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка" className="rounded-[11px] border border-[#DED3C8] bg-white px-3 py-3 text-sm text-ink outline-none"><option value="popular">Сначала популярные</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option></select>
          </div>
          {products === null ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[.72] animate-pulse rounded-[18px] border border-[#E7DDD3] bg-white" />)}</div> : visible.length ? <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="rounded-[18px] border border-[#E7DDD3] bg-white py-20 text-center text-[#6E645C]">По выбранным фильтрам ничего не найдено</div>}
        </section>
      </div>
    </main>
    <SiteFooter />
    </div>
  </>;
}

function FilterTitle({ children }: { children: React.ReactNode }) { return <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-[#8A7F76]">{children}</h3>; }
