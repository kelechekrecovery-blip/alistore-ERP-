'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MobileFrame } from '@/components/mobile/MobileFrame';
import { MobileProductCard } from '@/components/mobile/MobileProductCard';
import { fetchCatalog, type CatalogProduct } from '@/lib/api';

const CATS: [string, string][] = [
  ['📱', 'Смартфоны'],
  ['💻', 'Ноутбуки'],
  ['🎧', 'Аудио'],
  ['⌚', 'Часы'],
  ['📲', 'Планшеты'],
  ['🔌', 'Аксессуары'],
];

export default function HomePage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 20 })
      .then((response) => setProducts(response.items))
      .catch(() => setProducts([]));
  }, []);

  const hits = (products ?? []).slice(0, 6);

  return (
    <MobileFrame active="home">
      <div className="px-4 pb-6 pt-1">
        {/* delivery banner */}
        <div className="mb-3.5 flex gap-2">
          <div className="flex-1 rounded-[15px] bg-gradient-to-br from-coral to-deep p-3.5">
            <div className="text-xl">⚡</div>
            <div className="mt-1.5 text-[13px] font-bold text-white">Доставка 1–2 ч</div>
            <div className="text-[11px] text-[#FFE0D5]">по Бишкеку</div>
          </div>
          <div className="flex-1 rounded-[15px] border border-[#2E2822] bg-[#221E19] p-3.5">
            <div className="text-xl">🏬</div>
            <div className="mt-1.5 text-[13px] font-bold text-white">Самовывоз</div>
            <div className="text-[11px] text-[#A79C92]">бесплатно</div>
          </div>
          <Link href="/trade-in" className="flex-1 rounded-[15px] border border-[#2E2822] bg-[#221E19] p-3.5">
            <div className="text-xl">♻️</div>
            <div className="mt-1.5 text-[13px] font-bold text-white">Trade-in</div>
            <div className="text-[11px] text-lime">оценка за 30с</div>
          </Link>
        </div>

        {/* categories */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {CATS.map(([icon, name]) => (
            <Link
              key={name}
              href={`/catalog?category=${encodeURIComponent(name)}`}
              className="flex-shrink-0 rounded-[12px] border border-[#2E2822] bg-[#221E19] px-3.5 py-2.5 text-center"
            >
              <div className="text-[22px]">{icon}</div>
              <div className="mt-1 whitespace-nowrap text-[11px] text-[#D8CFC6]">{name}</div>
            </Link>
          ))}
        </div>

        {/* hero promo */}
        <Link
          href="/catalog"
          className="relative mb-[22px] block overflow-hidden rounded-[20px] border border-[#2E2822] bg-gradient-to-br from-[#2A2A2E] to-[#16130F] p-[22px]"
        >
          <div className="font-mono text-[11px] text-lime">НОВИНКА · В НАЛИЧИИ</div>
          <div className="mt-2 font-display text-[24px] font-extrabold leading-[1.05] text-white">iPhone 17 Pro Max</div>
          <div className="mt-1 text-[13px] text-[#A79C92]">от 115 000 сом · рассрочка 0%</div>
          <span className="mt-4 inline-block rounded-[10px] bg-lime px-[18px] py-2.5 text-[13px] font-bold text-lime-ink">
            Смотреть
          </span>
          <div className="pointer-events-none absolute -bottom-2.5 -right-2.5 text-[90px] opacity-[0.15]">📱</div>
        </Link>

        {/* hits */}
        <div className="mb-3 flex items-center">
          <span className="font-display text-[18px] font-bold text-white">🔥 Хиты продаж</span>
          <Link href="/catalog" className="ml-auto text-[13px] text-lime">
            Все →
          </Link>
        </div>
        {products === null ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[232px] animate-pulse rounded-[16px] border border-[#2E2822] bg-[#221E19]" />
            ))}
          </div>
        ) : hits.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {hits.map((product) => (
              <MobileProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#2E2822] bg-[#221E19] px-4 py-10 text-center text-sm text-[#A79C92]">
            Каталог скоро наполнится.{' '}
            <Link href="/catalog" className="text-lime">
              Открыть каталог
            </Link>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
