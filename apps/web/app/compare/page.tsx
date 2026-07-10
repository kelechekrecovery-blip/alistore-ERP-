'use client';

import Image from 'next/image';
import Link from 'next/link';
import { GitCompareArrows, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { productImage } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useCompare } from '@/lib/compare';
import { conditionLabel, som } from '@/lib/format';

function attr(product: CatalogProduct, keys: string[]) {
  const attributes = product.attrs ?? {};
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '—';
}

export default function ComparePage() {
  const compare = useCompare();
  const { add } = useCart();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  useEffect(() => { fetchCatalog({ limit: 100 }).then((response) => setProducts(response.items)).catch(() => setProducts([])); }, []);
  const list = compare.ids.map((id) => products.find((product) => product.id === id)).filter(Boolean) as CatalogProduct[];
  const bestPrice = list.length > 1 ? Math.min(...list.map((product) => product.price)) : -1;

  return <div className="min-h-screen bg-[#0c0c17] text-[#f6f7fb]"><SiteHeader /><main className="mx-auto min-h-[620px] w-[min(1200px,92vw)] py-10 sm:py-14"><div className="text-xs text-[#6c7080]">Главная / Сравнение</div><h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Сравнение</h1><p className="mt-3 text-[#a2a6b6]">Сопоставьте цены, состояние, память и наличие.</p>{compare.hydrated && list.length === 0 ? <div className="mt-10 grid min-h-[330px] place-items-center rounded-[22px] border border-white/[0.09] bg-white/[0.035] text-center"><div><GitCompareArrows className="mx-auto text-[#6c7080]" size={40} /><h2 className="mt-5 font-display text-2xl font-bold">Нечего сравнивать</h2><p className="mt-2 text-[#a2a6b6]">Добавьте до четырёх товаров из карточки товара.</p><Link href="/catalog" className="mt-6 inline-flex rounded-full bg-[#f97316] px-6 py-3 text-sm font-bold text-[#180f02]">Открыть каталог</Link></div></div> : <div className="mt-10 overflow-x-auto rounded-[20px] border border-white/[0.09]"><div className="grid min-w-[760px] bg-white/[0.025]" style={{ gridTemplateColumns: `180px repeat(${Math.max(list.length, 1)}, minmax(220px, 1fr))` }}><div className="border-b border-r border-white/[0.08] p-5 text-sm text-[#6c7080]">Товар</div>{list.map((product) => <div key={product.id} className="relative border-b border-r border-white/[0.08] p-5 last:border-r-0"><button type="button" onClick={() => compare.remove(product.id)} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-[9px] border border-white/[0.09] text-[#6c7080] hover:text-[#ff9a9a]" aria-label="Убрать"><Trash2 size={15} /></button><Link href={`/product/${product.id}`} className="relative mx-auto block h-36 w-36"><Image src={productImage(product)} alt={product.name} fill sizes="144px" className="object-contain" /></Link><Link href={`/product/${product.id}`} className="mt-3 block min-h-[48px] font-medium leading-6 hover:text-[#fb9a4b]">{product.name}</Link>{product.price === bestPrice && <span className="mt-2 inline-flex rounded-full border border-[#22c55e]/25 bg-[#22c55e]/10 px-2 py-1 text-[10px] text-[#7ee2a0]">Лучшая цена</span>}<div className="mt-3 font-display text-xl font-bold">{som(product.price)}</div><button type="button" disabled={product.availableUnits < 1} onClick={() => add({ id: product.id, sku: product.sku, name: product.name, price: product.price })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#f97316] py-2.5 text-sm font-bold text-[#180f02] disabled:bg-white/[0.07] disabled:text-[#5f6372]"><ShoppingBag size={16} /> В корзину</button></div>)}<CompareRow label="Состояние" products={list} value={(product) => conditionLabel(product.attrs)} /><CompareRow label="Бренд" products={list} value={(product) => attr(product, ['brand','Бренд','производитель'])} /><CompareRow label="Память" products={list} value={(product) => attr(product, ['memory','storage','Память','объём'])} /><CompareRow label="Гарантия" products={list} value={(product) => conditionLabel(product.attrs) === 'Б/У' ? '6 месяцев' : '12 месяцев'} /><CompareRow label="Наличие" products={list} value={(product) => product.availableUnits > 0 ? `${product.availableUnits} шт.` : 'Под заказ'} /></div></div>}</main><SiteFooter /></div>;
}

function CompareRow({ label, products, value }: { label: string; products: CatalogProduct[]; value: (product: CatalogProduct) => string }) { return <><div className="border-b border-r border-white/[0.08] p-5 text-sm text-[#6c7080]">{label}</div>{products.map((product) => <div key={`${label}-${product.id}`} className="border-b border-r border-white/[0.08] p-5 text-sm text-[#d7d9e2] last:border-r-0">{value(product)}</div>)}</>; }
