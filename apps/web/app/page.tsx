'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Headphones, ImageOff, Laptop, PackagePlus, RotateCcw, Smartphone, Tablet, Tv, Watch } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileHome from '@/components/mobile/MobileHome';
import { fetchCatalog, fetchPublicStorefrontBlocks, fetchStorefrontContent, type CatalogProduct, type StorefrontBlock, type StorefrontPayload } from '@/lib/api';

const QUICK_CATEGORIES: Array<{ name: string; href: string; icon: ReactNode }> = [
  { name: 'Смартфоны', href: '/catalog?category=Смартфоны', icon: <Smartphone /> },
  { name: 'Ноутбуки', href: '/catalog?category=Ноутбуки', icon: <Laptop /> },
  { name: 'Планшеты', href: '/catalog?category=Планшеты', icon: <Tablet /> },
  { name: 'Наушники', href: '/catalog?category=Аудио', icon: <Headphones /> },
  { name: 'Часы', href: '/catalog?category=Часы', icon: <Watch /> },
  { name: 'Телевизоры', href: '/catalog?category=Телевизоры', icon: <Tv /> },
  { name: 'Аксессуары', href: '/catalog?category=Аксессуары', icon: <PackagePlus /> },
  { name: 'Все категории', href: '/catalog', icon: <ArrowRight /> },
];

export default function HomePage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  const [blocks, setBlocks] = useState<StorefrontBlock[]>([]);

  useEffect(() => {
    Promise.all([fetchStorefrontContent(), fetchPublicStorefrontBlocks('desktop')]).then(async ([payload, publishedBlocks]) => {
      setStorefront(payload);
      setBlocks(publishedBlocks);
      if (payload?.featuredProducts.length) {
        setProducts(payload.featuredProducts);
        return;
      }
      setProducts((await fetchCatalog({ limit: 12, sort: 'stock_desc' })).items);
    }).catch(() => setProducts([]));
  }, []);

  return (
    <>
      <div className="md:hidden"><MobileHome /></div>
      <div className="hidden min-h-screen bg-[#f5f5f7] text-[#0f0f0f] [font-family:Manrope,-apple-system,BlinkMacSystemFont,sans-serif] md:block">
        <SiteHeader />
        <main className="mx-auto max-w-[1400px] px-5 py-5">
          {blocks.length > 0 ? <ManagedDesktopBlocks blocks={blocks} /> : <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-4" aria-label="Предложения AliStore">
            <Link href={storefront?.content.heroCtaHref ?? '/catalog'} className="group relative flex min-h-[320px] overflow-hidden rounded-[14px] bg-[#1a1a1a] p-10 text-white">
              <div className="relative z-10 flex max-w-[560px] flex-col justify-center">
                <span className="mb-5 w-fit rounded-md bg-[#ff4d2e] px-2.5 py-1.5 text-[11px] font-bold uppercase">{storefront?.content.heroEyebrow ?? 'AliStore'}</span>
                <h1 className="text-[44px] font-extrabold leading-[1.05]">{storefront?.content.heroTitle ?? 'Техника из актуального каталога'}</h1>
                <p className="mt-3 max-w-[50ch] text-[15px] text-white/70">{storefront?.content.heroBody ?? 'Цены и наличие обновляются из складской системы.'}</p>
                <span className="mt-7 flex w-fit items-center gap-2 rounded-[9px] bg-white px-5 py-3 text-sm font-bold text-[#0f0f0f] transition-transform group-hover:translate-x-1">{storefront?.content.heroCtaLabel ?? 'Открыть каталог'} <ArrowRight size={17} /></span>
              </div>
              <div className="absolute -right-12 -top-20 h-[440px] w-[440px] rounded-full bg-[#ff4d2e]/15 blur-3xl" />
              {storefront?.content.heroImageUrl ? <Image src={storefront.content.heroImageUrl} alt="" width={360} height={360} loading="eager" fetchPriority="high" className="absolute -bottom-16 right-4 h-[360px] w-[360px] object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105" /> : <ImageOff className="absolute bottom-10 right-14 text-white/20" size={120} />}
            </Link>

            <div className="grid grid-rows-2 gap-4">
              <Link href="/trade-in" className="group relative overflow-hidden rounded-[14px] bg-[#fff2ef] p-6">
                <span className="text-xs font-bold uppercase text-[#ff4d2e]">Trade-in</span>
                <h2 className="mt-2 max-w-[12ch] text-2xl font-extrabold leading-tight">Обменяйте старый смартфон</h2>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold">Оценить онлайн <ArrowRight size={15} /></span>
                <RotateCcw className="absolute bottom-5 right-5 text-[#ff4d2e]/30 transition-transform duration-500 group-hover:-rotate-12" size={68} />
              </Link>
              <Link href="/delivery" className="group relative overflow-hidden rounded-[14px] bg-[#0f0f0f] p-6 text-white">
                <span className="text-xs font-bold uppercase text-[#ffb800]">Получение заказа</span>
                <h2 className="mt-2 text-2xl font-extrabold">Доставка и самовывоз</h2>
                <p className="mt-1 text-sm text-white/65">Условия рассчитываются при оформлении</p>
              </Link>
            </div>
          </section>}

          <section className="mt-6 grid grid-cols-8 gap-3" aria-label="Категории товаров">
            {QUICK_CATEGORIES.map((item) => (
              <Link key={item.name} href={item.href} className="group flex min-h-[112px] min-w-0 flex-col items-center justify-center gap-3 rounded-[12px] border border-[#e5e5e7] bg-white px-2 text-center transition hover:-translate-y-0.5 hover:border-[#d2d2d7] hover:shadow-sm">
                <span className="grid h-10 w-10 place-items-center text-[#0f0f0f] [&_svg]:h-6 [&_svg]:w-6">{item.icon}</span>
                <span className="max-w-full text-[12px] font-semibold leading-4">{item.name}</span>
              </Link>
            ))}
          </section>

          {Boolean(storefront?.content.benefits.length) && <section className="mt-6 grid grid-cols-2 divide-x divide-[#e5e5e7] rounded-[12px] border border-[#e5e5e7] bg-white py-5 lg:grid-cols-4">{storefront!.content.benefits.slice(0,4).map((benefit) => <Benefit key={benefit.title} icon={<ArrowRight />} title={benefit.title} text={benefit.body} />)}</section>}

          {!blocks.some((block) => block.type === 'collection') && <section className="pb-10 pt-12">
            <div className="mb-6 flex items-end justify-between">
              <div><p className="text-xs font-bold uppercase text-[#ff4d2e]">Подборка магазина</p><h2 className="mt-1 text-[28px] font-extrabold">{storefront?.content.featuredTitle ?? 'Товары в каталоге'}</h2></div>
              <Link href="/catalog" className="flex items-center gap-2 text-sm font-bold hover:text-[#ff4d2e]">Смотреть все <ArrowRight size={17} /></Link>
            </div>
            {products === null ? <CatalogSkeleton /> : products.length > 0 ? <div className="grid grid-cols-4 gap-4">{products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="rounded-[12px] border border-[#e5e5e7] bg-white px-6 py-12 text-center text-[#4a4a4a]">Каталог обновляется. <Link href="/catalog" className="font-bold text-[#ff4d2e]">Открыть каталог</Link></div>}
          </section>}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}

function ManagedDesktopBlocks({ blocks }: { blocks: StorefrontBlock[] }) {
  return <section className="grid gap-4" aria-label="Предложения AliStore" data-testid="managed-storefront-blocks">
    {blocks.map((block) => block.type === 'collection'
      ? <div key={block.id} className="py-8" data-storefront-block={block.id}>
          <div className="mb-5 flex items-end justify-between"><div>{block.eyebrow && <p className="text-xs font-bold uppercase text-[#ff4d2e]">{block.eyebrow}</p>}<h2 className="mt-1 text-[28px] font-extrabold">{block.title}</h2>{block.body && <p className="mt-1 text-sm text-[#6e6e73]">{block.body}</p>}</div>{block.ctaHref && <Link href={block.ctaHref} className="flex items-center gap-2 text-sm font-bold">{block.ctaLabel ?? 'Смотреть все'} <ArrowRight size={17} /></Link>}</div>
          {block.products?.length ? <div className="grid grid-cols-4 gap-4">{block.products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="rounded-[12px] border border-[#e5e5e7] bg-white px-6 py-10 text-center text-[#6e6e73]">Подборка временно недоступна</div>}
        </div>
      : <ManagedBanner key={block.id} block={block} />)}
  </section>;
}

function ManagedBanner({ block }: { block: StorefrontBlock }) {
  const Heading = block.type === 'hero' ? 'h1' : 'h2';
  return <Link href={block.ctaHref ?? '/catalog'} data-storefront-block={block.id} className={`group relative flex overflow-hidden rounded-[14px] p-10 ${block.type === 'hero' ? 'min-h-[320px]' : 'min-h-[180px]'} ${desktopTone(block.tone)}`}>
    <div className="relative z-10 flex max-w-[640px] flex-col justify-center">{block.eyebrow && <span className="mb-4 w-fit rounded-md bg-[#ff4d2e] px-2.5 py-1.5 text-[11px] font-bold uppercase text-white">{block.eyebrow}</span>}<Heading className={`${block.type === 'hero' ? 'text-[44px]' : 'text-[30px]'} font-extrabold leading-[1.05]`}>{block.title}</Heading>{block.body && <p className="mt-3 max-w-[58ch] text-[15px] opacity-70">{block.body}</p>}{block.ctaLabel && <span className="mt-6 flex w-fit items-center gap-2 rounded-[9px] bg-white px-5 py-3 text-sm font-bold text-[#0f0f0f]">{block.ctaLabel} <ArrowRight size={17} /></span>}</div>
    {block.imageUrl && <Image src={block.imageUrl} alt="" width={420} height={320} unoptimized className="absolute bottom-0 right-6 h-[90%] w-[38%] object-contain" />}
  </Link>;
}

function desktopTone(tone: StorefrontBlock['tone']) {
  if (tone === 'coral') return 'bg-[#ff4d2e] text-white';
  if (tone === 'light') return 'border border-[#e5e5e7] bg-white text-[#0f0f0f]';
  if (tone === 'lime') return 'bg-lime text-lime-ink';
  return 'bg-[#1a1a1a] text-white';
}

function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex items-center justify-center gap-3 px-5"><span className="text-[#ff4d2e] [&_svg]:h-6 [&_svg]:w-6">{icon}</span><span><strong className="block text-[13px] font-bold">{title}</strong><small className="mt-0.5 block text-[11px] text-[#8a8a8a]">{text}</small></span></div>;
}

function CatalogSkeleton() {
  return <div className="grid grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[.76] animate-pulse rounded-[12px] border border-[#e5e5e7] bg-white" />)}</div>;
}
