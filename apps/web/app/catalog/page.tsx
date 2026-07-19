'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileCatalog from '@/components/mobile/MobileCatalog';
import { fetchCatalog, fetchCatalogCategories, type CatalogProduct, type CatalogQuery } from '@/lib/api';

const PAGE_SIZE = 24;

export default function CatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [stockOnly, setStockOnly] = useState(false);
  const [sort, setSort] = useState<CatalogQuery['sort']>('stock_desc');
  const [categories, setCategories] = useState<string[]>(['Все']);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    setCategory(params.get('category') ?? 'Все');
    fetchCatalogCategories().then((items) => setCategories(['Все', ...items.map((item) => item.category)]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProducts(null);
      setError(false);
      fetchCatalog({ q: query.trim() || undefined, category: category === 'Все' ? undefined : category, stockOnly, sort, limit: PAGE_SIZE, offset })
        .then((response) => { setProducts(response.items); setTotal(response.total); })
        .catch(() => { setProducts([]); setTotal(0); setError(true); });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, category, stockOnly, sort, offset, reloadKey]);

  const reset = () => { setQuery(''); setCategory('Все'); setStockOnly(false); setSort('stock_desc'); setOffset(0); };

  return <>
    <div className="md:hidden"><MobileCatalog /></div>
    <div className="hidden min-h-screen bg-[#0b0a08] font-sans text-[#e5dcd3] md:block">
    <SiteHeader variant="design3" />
    <main className="mx-auto max-w-[1400px] px-5 py-8">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><div className="text-xs text-white/40">Главная / Каталог</div><h1 className="mt-3 text-[34px] font-extrabold text-white">Каталог техники</h1><p className="mt-2 text-white/45">Новое и проверенное Б/У с гарантией AliStore</p></div>
        <div className="text-sm text-white/45">{products === null ? 'Загрузка...' : `${total} товаров`}</div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[238px_1fr]">
        <aside className="h-fit rounded-[16px] border border-white/10 bg-gradient-to-br from-white/[.08] to-white/[.02] p-5 shadow-[0_12px_30px_rgba(0,0,0,.35)] backdrop-blur-xl lg:sticky lg:top-24">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-display font-semibold text-white"><SlidersHorizontal size={17} /> Фильтры</h2><button type="button" onClick={reset} className="text-xs font-semibold text-[#ff9a6e]">Сбросить</button></div>
          <FilterTitle>Категория</FilterTitle>
          <div className="grid gap-1">{categories.map((item) => <button key={item} type="button" onClick={() => { setCategory(item); setOffset(0); }} className={`rounded-[9px] px-3 py-2 text-left text-sm ${category === item ? 'bg-[#ff5b2e]/15 font-semibold text-[#ff9a6e]' : 'text-white/50 hover:bg-white/[.06] hover:text-white'}`}>{item}</button>)}</div>
          <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-white/50"><input type="checkbox" checked={stockOnly} onChange={(event) => { setStockOnly(event.target.checked); setOffset(0); }} className="h-4 w-4 accent-coral" /> Только в наличии</label>
        </aside>

        <section>
          <div className="mb-5 flex flex-col gap-3 rounded-[16px] border border-white/10 bg-white/[.04] p-3 shadow-[0_10px_25px_rgba(0,0,0,.25)] sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center rounded-[10px] border border-white/10 bg-white/[.05] px-3 focus-within:border-[#ff7a4d] focus-within:bg-white/[.09]"><input aria-label="Поиск по каталогу" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Поиск по названию, SKU и категории" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-white/35" />{query && <button type="button" onClick={() => { setQuery(''); setOffset(0); }} aria-label="Очистить поиск" className="text-white/45"><X size={17} /></button>}</div>
            <select value={sort} onChange={(event) => { setSort(event.target.value as CatalogQuery['sort']); setOffset(0); }} aria-label="Сортировка" className="rounded-[10px] border border-white/10 bg-[#201b17] px-3 py-3 text-sm text-white outline-none"><option value="stock_desc">Сначала в наличии</option><option value="price_asc">Сначала дешевле</option><option value="price_desc">Сначала дороже</option><option value="name">По названию</option></select>
          </div>
          {products === null ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[.62] animate-pulse rounded-[16px] border border-white/10 bg-white/[.05]" />)}</div> : error ? <div className="rounded-[16px] border border-danger/30 bg-danger/5 py-20 text-center"><p className="font-display font-bold text-danger">Не удалось загрузить каталог</p><p className="mt-1 text-sm text-white/45">Проверьте соединение и попробуйте снова.</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-5 rounded-btn bg-coral px-5 py-2.5 text-sm font-bold text-white transition hover:bg-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-coral/25">Повторить</button></div> : products.length ? <><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} variant="design3" />)}</div><div className="mt-6 flex items-center justify-center gap-3"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-btn border border-white/10 bg-white/[.05] px-4 py-2 text-sm text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 disabled:opacity-40">Назад</button><span className="text-sm text-white/45">{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-btn border border-white/10 bg-white/[.05] px-4 py-2 text-sm text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 disabled:opacity-40">Дальше</button></div></> : <div className="rounded-[16px] border border-white/10 bg-white/[.04] py-20 text-center text-white/45">По выбранным фильтрам ничего не найдено</div>}
        </section>
      </div>
    </main>
    <SiteFooter />
    </div>
  </>;
}

function FilterTitle({ children }: { children: React.ReactNode }) { return <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-white/35">{children}</h3>; }
