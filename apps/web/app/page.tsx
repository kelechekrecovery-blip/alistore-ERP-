'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Clock3, CreditCard, MapPin, Search, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';

const CATEGORIES = [
  ['Все', ''], ['Смартфоны', 'Смартфоны'], ['Ноутбуки', 'Ноутбуки'], ['Аудио', 'Аудио'],
  ['Часы', 'Часы'], ['Планшеты', 'Планшеты'], ['Аксессуары', 'Аксессуары'],
] as const;

export default function HomePage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [category, setCategory] = useState('');

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((response) => setProducts(response.items)).catch(() => setProducts([]));
  }, []);

  const visible = useMemo(() => {
    const all = products ?? [];
    if (!category) return all;
    const target = category.toLocaleLowerCase('ru');
    return all.filter((product) => product.category.toLocaleLowerCase('ru').includes(target));
  }, [products, category]);

  return (
    <div className="min-h-screen bg-[#0c0c17] text-[#f6f7fb]">
      <SiteHeader />
      <main>
        <section className="mx-auto w-[min(1200px,92vw)] pb-6 pt-10 lg:pt-14">
          <div className="relative min-h-[470px] overflow-hidden rounded-[26px] border border-white/[0.14] bg-[radial-gradient(100%_140%_at_90%_-10%,rgba(249,115,22,.26),transparent_55%),radial-gradient(75%_110%_at_8%_10%,rgba(76,74,168,.22),transparent_65%),rgba(255,255,255,.035)] px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
            <div className="relative z-10 max-w-[650px]">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#fb9a4b]"><span className="h-px w-6 bg-[#f97316]" />Официальная техника · наличие в Бишкеке</div>
              <h1 className="mt-6 max-w-[13ch] font-display text-[42px] font-bold leading-[1.04] text-white sm:text-[56px] lg:text-[66px]">Электроника, <span className="text-[#f5843d]">которая уже рядом.</span></h1>
              <p className="mt-5 max-w-[46ch] text-base leading-7 text-[#a2a6b6] sm:text-lg">Смартфоны, ноутбуки, аудио и аксессуары с гарантией, честным Trade-in и доставкой по Кыргызстану.</p>
              <form action="/catalog" className="mt-8 flex max-w-[570px] gap-2 rounded-[14px] border border-white/[0.11] bg-white/[0.045] p-2 focus-within:border-[#f97316]">
                <label htmlFor="hero-search" className="sr-only">Поиск по каталогу</label>
                <Search className="ml-2 mt-3 shrink-0 text-[#6c7080]" size={19} />
                <input id="hero-search" name="q" placeholder="Искать: iPhone, наушники, SSD..." className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm text-white outline-none placeholder:text-[#6c7080]" />
                <button className="rounded-[11px] bg-gradient-to-br from-[#f97316] to-[#ea580c] px-5 text-sm font-bold text-[#180f02]">Найти</button>
              </form>
              <div className="mt-5 flex flex-wrap gap-2">
                {CATEGORIES.map(([label, value]) => <button key={label} type="button" onClick={() => setCategory(value)} className={`rounded-[10px] border px-3 py-2 text-xs transition ${category === value ? 'border-[#f97316]/50 bg-[#f97316]/15 text-[#fb9a4b]' : 'border-white/[0.09] bg-white/[0.04] text-[#a2a6b6] hover:border-white/[0.18] hover:text-white'}`}>{label}</button>)}
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-12 right-[-35px] hidden h-[520px] w-[520px] lg:block">
              <Image src="/products/p-iphone.png" alt="iPhone из каталога AliStore" fill priority sizes="520px" className="object-contain drop-shadow-[0_40px_65px_rgba(0,0,0,.7)]" />
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-[min(1200px,92vw)] gap-4 py-4 lg:grid-cols-[1.25fr_.8fr_.8fr] lg:grid-rows-2">
          <Link href="/catalog?category=Смартфоны" className="group relative min-h-[330px] overflow-hidden rounded-[20px] border border-white/[0.11] bg-[radial-gradient(circle_at_80%_15%,rgba(249,115,22,.18),transparent_42%),linear-gradient(145deg,#281716,#14121d)] p-7 lg:row-span-2">
            <span className="rounded-full border border-[#f97316]/30 bg-[#f97316]/15 px-3 py-1 text-xs text-[#fb9a4b]">−18% · неделя смартфонов</span>
            <h2 className="mt-5 max-w-[14ch] font-display text-3xl font-bold leading-tight">Смартфоны с гарантией</h2>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-[#a2a6b6]">Проверка устройства, сервис и бонусы за каждую покупку.</p>
            <Image src="/products/p-samsung.png" alt="Смартфоны" width={250} height={250} className="absolute -bottom-10 -right-6 object-contain transition duration-500 group-hover:scale-105" />
          </Link>
          <PromoTile href="/catalog?category=Аудио" title="Аудио" subtitle="Наушники и колонки" image="/products/p-airpods.png" tone="blue" />
          <PromoTile href="/catalog?category=Часы" title="Смарт-часы" subtitle="Здоровье и спорт" image="/products/p-watch.png" tone="green" />
          <Link href="/catalog?category=Ноутбуки" className="group relative min-h-[190px] overflow-hidden rounded-[20px] border border-white/[0.11] bg-[radial-gradient(circle_at_85%_20%,rgba(105,91,193,.22),transparent_45%),#11101f] p-6 lg:col-span-2">
            <h2 className="font-display text-xl font-bold">Ноутбуки для работы и учёбы</h2>
            <p className="mt-2 text-sm text-[#a2a6b6]">Рассрочка 0-0-12 и Trade-in</p>
            <Image src="/products/p-macbook.png" alt="Ноутбуки" width={230} height={180} className="absolute -bottom-8 right-1 object-contain transition duration-500 group-hover:scale-105 sm:right-10" />
          </Link>
        </section>

        <section className="mx-auto w-[min(1200px,92vw)] pt-20">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#fb9a4b]"><Sparkles size={14} /> Хиты недели</div><h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Популярное в Бишкеке</h2></div>
            <Link href="/catalog" className="hidden items-center gap-2 text-sm text-[#fb9a4b] sm:flex">Весь каталог <ArrowRight size={17} /></Link>
          </div>
          {products === null ? <CatalogSkeleton /> : visible.length > 0 ? <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{visible.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="rounded-[18px] border border-white/[0.09] bg-white/[0.035] px-6 py-12 text-center text-[#a2a6b6]">В этой категории товары скоро появятся. <Link href="/catalog" className="text-[#fb9a4b]">Открыть весь каталог</Link></div>}
        </section>

        <section className="mx-auto w-[min(1200px,92vw)] pt-24">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#fb9a4b]">Почему AliStore</div>
          <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Покупка без сюрпризов</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Benefit icon={<ShieldCheck />} title="Честная гарантия" text="Проверяем технику и фиксируем гарантию в цифровом кабинете." />
            <Benefit icon={<CreditCard />} title="Удобная оплата" text="Карта, QR MBank, O!Деньги, наличные и рассрочка 0-0-12." />
            <Benefit icon={<Truck />} title="Быстрая доставка" text="По Бишкеку за 1–2 часа или бесплатный самовывоз." />
            <Benefit icon={<BadgeCheck />} title="Бонусы AliStore" text="Начисляем баллы с покупки и принимаем промокоды." />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PromoTile({ href, title, subtitle, image, tone }: { href: string; title: string; subtitle: string; image: string; tone: 'blue' | 'green' }) {
  const background = tone === 'blue' ? 'bg-[radial-gradient(circle_at_90%_10%,rgba(96,165,250,.2),transparent_50%),#111424]' : 'bg-[radial-gradient(circle_at_90%_10%,rgba(34,197,94,.16),transparent_50%),#101b1b]';
  return <Link href={href} className={`group relative min-h-[150px] overflow-hidden rounded-[20px] border border-white/[0.11] p-6 ${background}`}><h2 className="font-display text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-[#a2a6b6]">{subtitle}</p><Image src={image} alt={title} width={120} height={120} className="absolute -bottom-5 right-0 object-contain transition duration-500 group-hover:scale-105" /></Link>;
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-6"><span className="grid h-11 w-11 place-items-center rounded-[12px] border border-[#f97316]/25 bg-[#f97316]/10 text-[#fb9a4b]">{icon}</span><h3 className="mt-5 font-display text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#a2a6b6]">{text}</p></div>;
}

function CatalogSkeleton() {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[.72] animate-pulse rounded-[18px] border border-white/[0.07] bg-white/[0.035]" />)}</div>;
}
