'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Headphones, ImageOff, Laptop, PackagePlus, RotateCcw, ShieldCheck, Smartphone, Tablet, Truck, Tv, Watch } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LoadFailure } from '@/components/LoadFailure';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileHome from '@/components/mobile/MobileHome';
import { fetchCatalog, isCatalogUnavailable, fetchPublicStorefrontBlocks, fetchStorefrontContent, type CatalogProduct, type StorefrontBlock, type StorefrontPayload } from '@/lib/api';

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

const BENEFIT_ICONS = [ShieldCheck, Truck, RotateCcw, BadgeCheck];

interface HomePageProps {
  /** Витрина, полученная сервером; `null` — сервер не смог, клиент запросит сам. */
  initialStorefront?: StorefrontPayload | null;
  initialBlocks?: StorefrontBlock[];
  /** Подборка первого экрана; `null` — данных с сервера нет (не «товаров нет»). */
  initialProducts?: CatalogProduct[] | null;
}

export default function HomePage({ initialStorefront = null, initialBlocks = [], initialProducts = null }: HomePageProps = {}) {
  const [products, setProducts] = useState<CatalogProduct[] | null>(initialProducts);
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(initialStorefront);
  const [blocks, setBlocks] = useState<StorefrontBlock[]>(initialBlocks);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Сервер уже отрисовал первый экран — повторять его запросы на монтировании
   * незачем. Кнопка «Повторить» и любой следующий прогон эффекта работают как
   * прежде: флаг снимается после первого пропуска.
   */
  const hasServerFirstPage = useRef(initialProducts !== null);

  useEffect(() => {
    if (hasServerFirstPage.current) {
      hasServerFirstPage.current = false;
      return;
    }
    Promise.all([fetchStorefrontContent(), fetchPublicStorefrontBlocks('desktop')]).then(async ([payload, publishedBlocks]) => {
      setStorefront(payload);
      setBlocks(publishedBlocks);
      if (payload?.featuredProducts.length) {
        setProducts(payload.featuredProducts);
        return;
      }
      const catalog = await fetchCatalog({ limit: 12, sort: 'stock_desc' });
      // Клиент каталога отдаёт мягкий отказ вместо исключения; без этой проверки
      // сбой сервера доходил до экрана как «товаров нет».
      if (isCatalogUnavailable(catalog)) throw new Error('Каталог не ответил');
      setProducts(catalog.items);
    }).catch((cause: unknown) => {
      // `setProducts([])` показывал покупателю «Каталог обновляется» — то же
      // самое, что видит владелец пустого магазина. Сбой обязан выглядеть иначе.
      setProducts(null);
      setLoadError(cause instanceof Error && cause.message ? cause.message : '');
    });
  }, [reloadToken]);

  return (
    <>
      <div className="md:hidden"><MobileHome /></div>
      <div className="hidden min-h-screen bg-[#0b0a08] font-sans text-[#e5dcd3] md:block">
        <SiteHeader variant="design3" />
        <main className="mx-auto max-w-[1400px] px-5 py-5">
          {blocks.length > 0 ? <ManagedDesktopBlocks blocks={blocks} /> : <section className="grid grid-cols-[minmax(0,1.1fr)_minmax(320px,1fr)] items-center gap-5 rounded-b-[22px] px-3 pb-4 pt-5" aria-label="Предложения AliStore">
            <Link href={storefront?.content.heroCtaHref ?? '/catalog'} className="group relative flex min-h-[320px] overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2a2620] to-[#201b17] p-10 text-white shadow-[0_16px_40px_rgba(0,0,0,.45)]">
              <div className="relative z-10 flex max-w-[560px] flex-col justify-center">
                <span className="mb-5 w-fit rounded-full border border-[#ff7a4d]/30 bg-[#ff7a4d]/15 px-3 py-1.5 text-[11px] font-bold uppercase text-[#ff9a6e]">{storefront?.content.heroEyebrow ?? 'Доставка 1–2 часа по Манасу'}</span>
                <h1 className="max-w-[620px] text-[44px] font-extrabold leading-[1.05]">{storefront?.content.heroTitle ?? 'Техника с гарантией. Новое и Б/У.'}</h1>
                <p className="mt-3 max-w-[50ch] text-[15px] text-[#a79c92]">{storefront?.content.heroBody ?? 'Рассрочка 0%, trade-in старого устройства, один профиль и корзина на сайте и в приложении.'}</p>
                <span className="erp3-coral-action mt-7 flex w-fit items-center gap-2 rounded-[12px] px-5 py-3 text-sm font-bold transition-transform group-hover:translate-x-1">{storefront?.content.heroCtaLabel ?? 'В каталог'} <ArrowRight size={17} /></span>
              </div>
              {storefront?.content.heroImageUrl
                ? <MediaImage src={storefront.content.heroImageUrl} width={360} height={360} priority className="absolute -bottom-16 right-4 h-[360px] w-[360px] object-contain drop-shadow-2xl transition-transform duration-500 group-hover:scale-105" />
                : <ImageOff className="absolute bottom-10 right-14 text-white/20" size={120} />}
            </Link>

            <div className="grid grid-rows-2 gap-4">
              <Link href="/trade-in" className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-white/[.08] to-white/[.02] p-6 shadow-[0_12px_30px_rgba(0,0,0,.35)] backdrop-blur-xl">
                <span className="text-xs font-bold uppercase text-[#ff9a6e]">Trade-in</span>
                <h2 className="mt-2 max-w-[12ch] text-2xl font-extrabold leading-tight text-white">Обменяйте старый смартфон</h2>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-white">Оценить онлайн <ArrowRight size={15} /></span>
                <RotateCcw className="absolute bottom-5 right-5 text-[#ff5b2e]/30 transition-transform duration-500 group-hover:-rotate-12" size={68} />
              </Link>
              <Link href="/delivery" className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-[#16130f] p-6 text-white shadow-[0_12px_30px_rgba(0,0,0,.35)]">
                <span className="text-xs font-bold uppercase text-[#e5b23c]">Получение заказа</span>
                <h2 className="mt-2 text-2xl font-extrabold">Доставка и самовывоз</h2>
                <p className="mt-1 text-sm text-white/55">Условия рассчитываются при оформлении</p>
              </Link>
            </div>
          </section>}

          <section className="mt-2 grid grid-cols-8 gap-3" aria-label="Категории товаров">
            {QUICK_CATEGORIES.map((item) => (
              <Link key={item.name} href={item.href} className="group flex min-h-[112px] min-w-0 flex-col items-center justify-center gap-3 rounded-[14px] border border-white/[.09] bg-gradient-to-br from-white/[.07] to-white/[.02] px-2 text-center shadow-[0_8px_20px_rgba(0,0,0,.24)] transition hover:-translate-y-0.5 hover:border-[#ff7a4d]/40">
                <span className="grid h-10 w-10 place-items-center text-[#ff9a6e] [&_svg]:h-6 [&_svg]:w-6">{item.icon}</span>
                <span className="max-w-full text-[12px] font-semibold leading-4 text-[#d8cfc6]">{item.name}</span>
              </Link>
            ))}
          </section>

          {Boolean(storefront?.content.benefits.length) && <section className="mt-4 grid grid-cols-2 divide-x divide-white/[.08] rounded-[16px] border border-white/[.09] bg-white/[.04] py-5 lg:grid-cols-4">{storefront!.content.benefits.slice(0,4).map((benefit, index) => { const Icon = BENEFIT_ICONS[index % BENEFIT_ICONS.length]; return <Benefit key={benefit.title} icon={<Icon />} title={benefit.title} text={benefit.body} dark />; })}</section>}

          {!blocks.some((block) => block.type === 'collection') && <section className="pb-10 pt-12">
            <div className="mb-6 flex items-end justify-between">
              <div><p className="text-xs font-bold uppercase text-[#ff9a6e]">Подборка магазина</p><h2 className="mt-1 text-[28px] font-extrabold text-white">{storefront?.content.featuredTitle ?? 'Популярное'}</h2></div>
              <Link href="/catalog" className="flex items-center gap-2 text-sm font-bold text-[#ff9a6e] hover:text-white">Весь каталог <ArrowRight size={17} /></Link>
            </div>
            {loadError !== '' ? <LoadFailure what="товары" detail={loadError} onRetry={() => { setLoadError(''); setReloadToken((value) => value + 1); }} /> : products === null ? <CatalogSkeleton /> : products.length > 0 ? <div className="grid grid-cols-4 gap-4">{products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} variant="design3" />)}</div> : <div className="rounded-[12px] border border-white/10 bg-white/[.04] px-6 py-12 text-center text-white/45">Каталог обновляется. <Link href="/catalog" className="font-bold text-[#ff9a6e]">Открыть каталог</Link></div>}
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
          <div className="mb-5 flex items-end justify-between"><div>{block.eyebrow && <p className="text-xs font-bold uppercase text-[#ff9a6e]">{block.eyebrow}</p>}<h2 className="mt-1 text-[28px] font-extrabold text-white">{block.title}</h2>{block.body && <p className="mt-1 text-sm text-white/45">{block.body}</p>}</div>{block.ctaHref && <Link href={block.ctaHref} className="flex items-center gap-2 text-sm font-bold text-[#ff9a6e]">{block.ctaLabel ?? 'Смотреть все'} <ArrowRight size={17} /></Link>}</div>
          {block.products?.length ? <div className="grid grid-cols-4 gap-4">{block.products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} variant="design3" />)}</div> : <div className="rounded-[12px] border border-white/10 bg-white/[.04] px-6 py-10 text-center text-white/45">Подборка временно недоступна</div>}
        </div>
      : <ManagedBanner key={block.id} block={block} />)}
  </section>;
}

function ManagedBanner({ block }: { block: StorefrontBlock }) {
  const Heading = block.type === 'hero' ? 'h1' : 'h2';
  return <Link href={block.ctaHref ?? '/catalog'} data-storefront-block={block.id} className={`group relative flex overflow-hidden rounded-[20px] border border-white/10 p-10 shadow-[0_16px_40px_rgba(0,0,0,.4)] ${block.type === 'hero' ? 'min-h-[320px]' : 'min-h-[180px]'} ${desktopTone(block.tone)}`}>
    <div className="relative z-10 flex max-w-[640px] flex-col justify-center">{block.eyebrow && <span className={`mb-4 w-fit rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase ${bannerEyebrow(block.tone)}`}>{block.eyebrow}</span>}<Heading className={`${block.type === 'hero' ? 'text-[44px]' : 'text-[30px]'} font-extrabold leading-[1.05]`}>{block.title}</Heading>{block.body && <p className="mt-3 max-w-[58ch] text-[15px] opacity-70">{block.body}</p>}{block.ctaLabel && <span className="erp3-coral-action mt-6 flex w-fit items-center gap-2 rounded-[12px] px-5 py-3 text-sm font-bold">{block.ctaLabel} <ArrowRight size={17} /></span>}</div>
    {block.imageUrl && <MediaImage src={block.imageUrl} width={420} height={320} className="absolute bottom-0 right-6 h-[90%] w-[38%] object-contain" />}
  </Link>;
}

/**
 * Декоративная картинка витрины (смысл несёт заголовок рядом, поэтому `alt=""`).
 *
 * Локальные пути (`/products/...` — сегодня это все картинки) идут через
 * оптимизатор Next и отдаются в AVIF/WebP. Внешние https-URL из CMS остаются
 * неоптимизированными: разрешить произвольные хосты в `remotePatterns` значит
 * превратить оптимизатор в открытый прокси. Раньше здесь стоял сырой `<img>` —
 * ровно из-за внешнего случая, но платили за это все картинки, включая свои.
 */
function MediaImage({ src, width, height, className, priority = false }: {
  src: string;
  width: number;
  height: number;
  className: string;
  priority?: boolean;
}) {
  return <Image src={src} alt="" width={width} height={height} priority={priority} unoptimized={src.startsWith('https://')} className={className} />;
}

/** Eyebrow chip must stay legible on every banner ground (coral/lime are light). */
function bannerEyebrow(tone: StorefrontBlock['tone']) {
  if (tone === 'coral') return 'border-white/45 bg-white/20 text-white';
  if (tone === 'lime') return 'border-black/25 bg-black/10 text-[#14110e]';
  return 'border-[#ff7a4d]/30 bg-[#ff7a4d]/15 text-[#ff9a6e]';
}

function desktopTone(tone: StorefrontBlock['tone']) {
  if (tone === 'coral') return 'bg-gradient-to-br from-[#ff7a4d] to-[#e8410f] text-white';
  if (tone === 'light') return 'bg-gradient-to-br from-white/[.08] to-white/[.02] text-white';
  if (tone === 'lime') return 'bg-[#c6ff3d] text-[#14110e]';
  return 'bg-gradient-to-br from-[#2a2620] to-[#201b17] text-white';
}

function Benefit({ icon, title, text, dark = false }: { icon: ReactNode; title: string; text: string; dark?: boolean }) {
  return <div className="flex items-center justify-center gap-3 px-5"><span className="text-[#ff7a4d] [&_svg]:h-6 [&_svg]:w-6">{icon}</span><span><strong className={`block text-[13px] font-bold ${dark ? 'text-white' : ''}`}>{title}</strong><small className={`mt-0.5 block text-[11px] ${dark ? 'text-white/45' : 'text-faint'}`}>{text}</small></span></div>;
}

function CatalogSkeleton() {
  return <div className="grid grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[.76] animate-pulse rounded-[12px] border border-white/10 bg-white/[.04]" />)}</div>;
}
