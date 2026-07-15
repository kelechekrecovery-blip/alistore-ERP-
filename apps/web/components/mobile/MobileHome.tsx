'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { Pressable, Stagger, StaggerItem } from '@/components/motion/primitives';
import { fetchCatalog, fetchPublicStorefrontBlocks, fetchStorefrontContent, type CatalogProduct, type StorefrontBlock, type StorefrontPayload } from '@/lib/api';

const CATS: [string, string][] = [
  ['📱', 'Смартфоны'],
  ['💻', 'Ноутбуки'],
  ['🎧', 'Аудио'],
  ['⌚', 'Часы'],
  ['📲', 'Планшеты'],
  ['🔌', 'Аксессуары'],
];

export default function MobileHome() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  const [blocks, setBlocks] = useState<StorefrontBlock[]>([]);

  useEffect(() => {
    Promise.all([fetchStorefrontContent(), fetchPublicStorefrontBlocks('mobile')]).then(async ([payload, publishedBlocks]) => {
      setStorefront(payload);
      setBlocks(publishedBlocks);
      if (payload?.featuredProducts.length) {
        setProducts(payload.featuredProducts);
        return;
      }
      setProducts((await fetchCatalog({ limit: 20, sort: 'stock_desc' })).items);
    }).catch(() => setProducts([]));
  }, []);

  const hits = (products ?? []).slice(0, 6);

  return (
    <MobileFrame active="home">
      <Stagger className="px-4 pb-6 pt-1">
        {blocks.map((block) => block.type === 'collection'
          ? <StaggerItem key={block.id} className="mb-5" data-storefront-block={block.id}><div className="mb-3 flex items-center"><span className="font-display text-[18px] font-bold text-white">{block.title}</span>{block.ctaHref && <Link href={block.ctaHref} className="ml-auto text-[13px] text-lime">{block.ctaLabel ?? 'Все'} →</Link>}</div><div className="grid grid-cols-2 gap-3">{block.products?.slice(0, 6).map((product, index) => <MobileProductCard key={product.id} product={product} priority={index === 0} />)}</div></StaggerItem>
          : <StaggerItem key={block.id} className="mb-4" data-storefront-block={block.id}><Link href={block.ctaHref ?? '/catalog'} className={`relative block min-h-[168px] overflow-hidden rounded-[20px] border p-[22px] ${mobileTone(block.tone)}`}><div className="relative z-10 max-w-[72%]">{block.eyebrow && <div className="font-mono text-[11px] text-lime">{block.eyebrow}</div>}<div className={`${block.type === 'hero' ? 'text-[24px]' : 'text-[20px]'} mt-2 font-display font-extrabold leading-[1.05]`}>{block.title}</div>{block.body && <div className="mt-2 text-[12px] opacity-70">{block.body}</div>}{block.ctaLabel && <span className="mt-4 inline-block rounded-[9px] bg-white px-4 py-2 text-[12px] font-bold text-black">{block.ctaLabel}</span>}</div>{block.imageUrl && <Image src={block.imageUrl} alt="" width={180} height={180} unoptimized className="absolute -bottom-4 -right-3 h-[150px] w-[150px] object-contain" />}</Link></StaggerItem>)}

        {/* delivery banner */}
        <StaggerItem className="mb-3.5 flex gap-2">
          <Pressable className="flex-1" hover={false}>
            <div className="rounded-[15px] bg-gradient-to-br from-coral to-deep p-3.5">
              <div className="text-xl">✓</div>
              <div className="mt-1.5 text-[13px] font-bold text-white">{storefront?.content.benefits[0]?.title ?? 'Актуальное наличие'}</div>
              <div className="text-[11px] text-[#FFE0D5]">{storefront?.content.benefits[0]?.body ?? 'из складской системы'}</div>
            </div>
          </Pressable>
          <Pressable className="flex-1" hover={false}>
            <div className="rounded-[15px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="text-xl">⌖</div>
              <div className="mt-1.5 text-[13px] font-bold text-white">Получение</div>
              <div className="text-[11px] text-[#A79C92]">условия в checkout</div>
            </div>
          </Pressable>
          <Pressable className="flex-1" hover={false}>
            <Link href="/trade-in" className="block rounded-[15px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="text-xl">♻️</div>
              <div className="mt-1.5 text-[13px] font-bold text-white">Trade-in</div>
              <div className="text-[11px] text-lime">оценка устройства</div>
            </Link>
          </Pressable>
        </StaggerItem>

        {/* categories */}
        <StaggerItem className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {CATS.map(([icon, name]) => (
            <Pressable key={name} className="flex-shrink-0" hover={false}>
              <Link
                href={`/catalog?category=${encodeURIComponent(name)}`}
                className="block rounded-[12px] border border-[#2E2822] bg-[#221E19] px-3.5 py-2.5 text-center"
              >
                <div className="text-[22px]">{icon}</div>
                <div className="mt-1 whitespace-nowrap text-[11px] text-[#D8CFC6]">{name}</div>
              </Link>
            </Pressable>
          ))}
        </StaggerItem>

        {/* hero promo */}
        {blocks.length === 0 && <StaggerItem className="mb-[22px]">
          <Pressable hover={false}>
            <Link
              href={storefront?.content.heroCtaHref ?? '/catalog'}
              className="relative block overflow-hidden rounded-[20px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#16130F] p-[22px]"
            >
              <div className="font-mono text-[11px] text-lime">{storefront?.content.heroEyebrow ?? 'ALISTORE'}</div>
              <div className="mt-2 font-display text-[24px] font-extrabold leading-[1.05] text-white">{storefront?.content.heroTitle ?? 'Техника из актуального каталога'}</div>
              <div className="mt-1 text-[13px] text-[#A79C92]">{storefront?.content.heroBody ?? 'Цена и остаток подтверждаются сервером.'}</div>
              <span className="mt-4 inline-block rounded-[10px] bg-lime px-[18px] py-2.5 text-[13px] font-bold text-lime-ink">
                {storefront?.content.heroCtaLabel ?? 'Смотреть'}
              </span>
              <div className="pointer-events-none absolute -bottom-2.5 -right-2.5 text-[90px] opacity-[0.15]">📱</div>
            </Link>
          </Pressable>
        </StaggerItem>}

        {/* hits */}
        {!blocks.some((block) => block.type === 'collection') && <><StaggerItem className="mb-3 flex items-center">
          <span className="font-display text-[18px] font-bold text-white">{storefront?.content.featuredTitle ?? 'Товары в каталоге'}</span>
          <Link href="/catalog" className="ml-auto text-[13px] text-lime">
            Все →
          </Link>
        </StaggerItem>
        {products === null ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[232px] animate-pulse rounded-[16px] border border-[#2E2822] bg-[#221E19]" />
            ))}
          </div>
        ) : hits.length > 0 ? (
          <StaggerItem className="grid grid-cols-2 gap-3">
            {hits.map((product, index) => (
              <MobileProductCard key={product.id} product={product} priority={index === 0} />
            ))}
          </StaggerItem>
        ) : (
          <div className="rounded-[16px] border border-[#2E2822] bg-[#221E19] px-4 py-10 text-center text-sm text-[#A79C92]">
            Каталог скоро наполнится.{' '}
            <Link href="/catalog" className="text-lime">
              Открыть каталог
            </Link>
          </div>
        )}</>}
      </Stagger>
    </MobileFrame>
  );
}

function mobileTone(tone: StorefrontBlock['tone']) {
  if (tone === 'coral') return 'border-coral bg-coral text-white';
  if (tone === 'light') return 'border-white bg-white text-[#14110E]';
  if (tone === 'lime') return 'border-lime bg-lime text-lime-ink';
  return 'border-[#2E2822] bg-[#16130F] text-white';
}
