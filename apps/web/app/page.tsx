'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, CreditCard, Search, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { FloatingProduct, Reveal, Stagger, StaggerItem } from '@/components/storefront/Motion';
import MobileHome from '@/components/mobile/MobileHome';
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
    <>
      {/* Narrow viewports / Capacitor native → Клиент App 2.0 mobile shell. */}
      <div className="md:hidden">
        <MobileHome />
      </div>

      {/* Desktop browser → wide storefront. */}
      <div className="hidden min-h-screen bg-sand text-ink md:block">
      <SiteHeader />
      <main>
        <section className="mx-auto w-[min(1200px,92vw)] pb-6 pt-10 lg:pt-14">
          <div className="relative min-h-[470px] overflow-hidden rounded-[20px] border border-[#E7DDD3] bg-[linear-gradient(120deg,#FFEFE7_0%,#FFF9F5_58%,#F2ECE5_100%)] px-6 py-10 shadow-soft sm:px-10 lg:px-14 lg:py-14">
            <Stagger className="relative z-10 max-w-[650px]">
              <StaggerItem><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-deep"><span className="h-px w-6 bg-coral" />Официальная техника · наличие в Бишкеке</div></StaggerItem>
              <StaggerItem><h1 className="mt-6 max-w-[13ch] font-display text-[42px] font-extrabold leading-[1.04] text-ink sm:text-[56px] lg:text-[62px]">Электроника, <span className="text-coral">которая уже рядом.</span></h1></StaggerItem>
              <StaggerItem><p className="mt-5 max-w-[46ch] text-base leading-7 text-[#6E645C] sm:text-lg">Смартфоны, ноутбуки, аудио и аксессуары с гарантией, честным Trade-in и доставкой по Кыргызстану.</p></StaggerItem>
              <StaggerItem>
                <form action="/catalog" className="mt-8 flex max-w-[570px] gap-2 rounded-[14px] border border-[#DED3C8] bg-white p-2 shadow-soft transition-colors focus-within:border-coral focus-within:ring-4 focus-within:ring-coral/10">
                  <label htmlFor="hero-search" className="sr-only">Поиск по каталогу</label>
                  <Search className="ml-2 mt-3 shrink-0 text-[#8A7F76]" size={19} />
                  <input id="hero-search" name="q" placeholder="Искать: iPhone, наушники, SSD..." className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm text-ink outline-none placeholder:text-[#A79C92]" />
                  <button className="rounded-[11px] bg-coral px-5 text-sm font-bold text-white transition active:scale-[0.98] hover:bg-deep">Найти</button>
                </form>
              </StaggerItem>
              <StaggerItem><div className="mt-5 flex flex-wrap gap-2">{CATEGORIES.map(([label, value]) => <button key={label} type="button" onClick={() => setCategory(value)} className={`rounded-[10px] border px-3 py-2 text-xs transition duration-200 active:scale-[0.97] ${category === value ? 'border-coral bg-coral text-white' : 'border-[#DED3C8] bg-white text-[#6E645C] hover:border-coral hover:text-deep'}`}>{label}</button>)}</div></StaggerItem>
            </Stagger>
            <FloatingProduct className="pointer-events-none absolute -bottom-12 right-[-35px] hidden h-[520px] w-[520px] lg:block">
              <Image src="/products/p-iphone.png" alt="iPhone из каталога AliStore" fill priority sizes="520px" className="object-contain drop-shadow-[0_40px_65px_rgba(0,0,0,.7)]" />
            </FloatingProduct>
          </div>
        </section>

        <section className="mx-auto grid w-[min(1200px,92vw)] gap-4 py-4 lg:grid-cols-[1.25fr_.8fr_.8fr] lg:grid-rows-2">
          <Reveal className="lg:row-span-2" distance={30}>
            <Link href="/catalog?category=Смартфоны" className="group relative block h-full min-h-[330px] overflow-hidden rounded-[20px] border border-[#E7DDD3] bg-tint p-7 shadow-soft transition-colors hover:border-coral/40">
              <span className="rounded-full border border-coral/25 bg-white px-3 py-1 text-xs text-deep">−18% · неделя смартфонов</span><h2 className="mt-5 max-w-[14ch] font-display text-3xl font-bold leading-tight text-ink">Смартфоны с гарантией</h2><p className="mt-3 max-w-[34ch] text-sm leading-6 text-[#6E645C]">Проверка устройства, сервис и бонусы за каждую покупку.</p><Image src="/products/p-samsung.png" alt="Смартфоны" width={250} height={250} className="absolute -bottom-10 -right-6 object-contain transition-transform duration-500 group-hover:-translate-y-2 group-hover:scale-105" />
            </Link>
          </Reveal>
          <PromoTile href="/catalog?category=Аудио" title="Аудио" subtitle="Наушники и колонки" image="/products/p-airpods.png" tone="blue" delay={0.08} />
          <PromoTile href="/catalog?category=Часы" title="Смарт-часы" subtitle="Здоровье и спорт" image="/products/p-watch.png" tone="green" delay={0.14} />
          <Reveal className="lg:col-span-2" delay={0.18}>
            <Link href="/catalog?category=Ноутбуки" className="group relative block h-full min-h-[190px] overflow-hidden rounded-[20px] border border-[#E7DDD3] bg-white p-6 shadow-soft transition-colors hover:border-coral/40"><h2 className="font-display text-xl font-bold text-ink">Ноутбуки для работы и учёбы</h2><p className="mt-2 text-sm text-[#6E645C]">Рассрочка 0-0-12 и Trade-in</p><span className="absolute -bottom-8 right-1 h-[180px] w-[230px] transition-transform duration-500 group-hover:-translate-y-2 group-hover:scale-105 sm:right-10"><Image src="/products/p-macbook.png" alt="Ноутбуки" fill sizes="230px" className="object-contain" /></span></Link>
          </Reveal>
        </section>

        <section className="mx-auto w-[min(1200px,92vw)] pt-20">
          <Reveal className="mb-7 flex items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-deep"><Sparkles size={14} /> Хиты недели</div><h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Популярное в Бишкеке</h2></div><Link href="/catalog" className="hidden items-center gap-2 text-sm font-semibold text-deep sm:flex">Весь каталог <ArrowRight size={17} /></Link></Reveal>
          {products === null ? <CatalogSkeleton /> : visible.length > 0 ? <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{visible.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="rounded-[18px] border border-[#E7DDD3] bg-white px-6 py-12 text-center text-[#6E645C]">В этой категории товары скоро появятся. <Link href="/catalog" className="text-deep">Открыть весь каталог</Link></div>}
        </section>

        <section className="mx-auto w-[min(1200px,92vw)] pt-24">
          <Reveal><div className="text-[11px] uppercase tracking-[0.18em] text-deep">Почему AliStore</div><h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Покупка без сюрпризов</h2></Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Reveal delay={0.02}><Benefit icon={<ShieldCheck />} title="Честная гарантия" text="Проверяем технику и фиксируем гарантию в цифровом кабинете." /></Reveal><Reveal delay={0.08}><Benefit icon={<CreditCard />} title="Удобная оплата" text="Карта, QR MBank, O!Деньги, наличные и рассрочка 0-0-12." /></Reveal><Reveal delay={0.14}><Benefit icon={<Truck />} title="Быстрая доставка" text="По Бишкеку за 1–2 часа или бесплатный самовывоз." /></Reveal><Reveal delay={0.2}><Benefit icon={<BadgeCheck />} title="Бонусы AliStore" text="Начисляем баллы с покупки и принимаем промокоды." /></Reveal></div>
        </section>
      </main>
      <SiteFooter />
      </div>
    </>
  );
}

function PromoTile({ href, title, subtitle, image, tone, delay }: { href: string; title: string; subtitle: string; image: string; tone: 'blue' | 'green'; delay: number }) {
  const background = tone === 'blue' ? 'bg-[#EEF5FC]' : 'bg-[#EEF7EF]';
  return <Reveal delay={delay}><Link href={href} className={`group relative block h-full min-h-[150px] overflow-hidden rounded-[20px] border border-[#E7DDD3] p-6 shadow-soft transition-colors hover:border-coral/40 ${background}`}><h2 className="font-display text-xl font-bold text-ink">{title}</h2><p className="mt-2 text-sm text-[#6E645C]">{subtitle}</p><Image src={image} alt={title} width={120} height={120} className="absolute -bottom-5 right-0 object-contain transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105" /></Link></Reveal>;
}

function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="h-full rounded-[18px] border border-[#E7DDD3] bg-white p-6 shadow-soft transition-colors hover:border-coral/30"><span className="grid h-11 w-11 place-items-center rounded-[12px] border border-coral/20 bg-tint text-deep">{icon}</span><h3 className="mt-5 font-display text-lg font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-[#6E645C]">{text}</p></div>; }
function CatalogSkeleton() { return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[.72] animate-pulse rounded-[18px] border border-[#E7DDD3] bg-white" />)}</div>; }
