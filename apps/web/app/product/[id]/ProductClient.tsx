'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchCatalog, fetchProduct, type CatalogProduct } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { useCompare } from '@/lib/compare';
import { conditionLabel, som } from '@/lib/format';

const TRUST = [
  '🛡 Гарантия 12 мес', '⚡ Доставка 1–2 ч', '🏬 Самовывоз сегодня', '↩️ Возврат 14 дней',
];

export default function ProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { add } = useCart();
  const { has, toggle } = useFavorites();
  const compare = useCompare();
  const [product, setProduct] = useState<CatalogProduct | null | 'missing'>(null);
  const [similar, setSimilar] = useState<CatalogProduct[]>([]);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetchProduct(params.id).then((p) => setProduct(p ?? 'missing'));
    fetchCatalog({ limit: 100 }).then((c) => setSimilar(c.items));
  }, [params.id]);

  if (product === null) {
    return <div className="fixed inset-0 z-40 grid place-items-center bg-[#16130F] font-mono text-sm text-[#8A7F76]">Загрузка…</div>;
  }
  if (product === 'missing') {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[#16130F] text-white">
        <div className="text-center">
          <p className="font-display text-lg font-bold">Товар не найден</p>
          <Link href="/" className="mt-3 inline-block text-sm text-lime">← На главную</Link>
        </div>
      </div>
    );
  }

  const inStock = product.availableUnits > 0;
  const used = conditionLabel(product.attrs) === 'Б/У';
  const specs = Object.entries(product.attrs ?? {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  const related = similar.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 6);

  function addToCart() {
    if (!product || product === 'missing') return;
    add({ id: product.id, sku: product.sku, name: product.name, price: product.price });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="relative flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex-1 overflow-y-auto pb-24">
          {/* image */}
          <div className="relative h-[260px] bg-gradient-to-br from-[#2A2620] to-[#16130F]">
            <span className="absolute inset-0 grid place-items-center font-display text-[7rem] font-extrabold text-white/10">{product.name.slice(0, 1)}</span>
            <button type="button" onClick={() => router.back()} className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white">←</button>
            <div className="absolute right-3 top-3 flex gap-2">
              <button type="button" onClick={() => toggle(product.id)} className="grid h-9 w-9 place-items-center rounded-full bg-black/55">{has(product.id) ? '❤️' : '🤍'}</button>
              <button
                type="button"
                onClick={() => compare.toggle(product.id)}
                className={`grid h-9 w-9 place-items-center rounded-full text-[15px] ${compare.has(product.id) ? 'bg-lime text-lime-ink' : 'bg-black/55 text-white'}`}
                title="Сравнить"
              >
                ⇄
              </button>
              <Link href="/compare" className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-sm">↗</Link>
            </div>
            <span className={`absolute bottom-3 left-4 rounded-md px-2 py-0.5 text-[11px] font-bold ${used ? 'bg-ink text-lime' : 'bg-lime text-lime-ink'}`}>{used ? 'Б/У' : 'Новое'}</span>
          </div>

          <div className="px-4 py-4">
            <div className="font-display text-[22px] font-extrabold leading-tight">{product.name}</div>
            <div className="mt-2.5 font-display text-[26px] font-extrabold">{som(product.price)}</div>
            <div className="mt-1.5 text-[13px] text-lime">рассрочка 0-0-12 · от {som(Math.round(product.price / 12))}/мес</div>

            {/* trust row */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {TRUST.map((t) => (
                <div key={t} className="rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-xs text-[#D8CFC6]">{t}</div>
              ))}
            </div>

            {/* availability */}
            <div className="mt-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="mb-2 text-[13px] font-semibold">Наличие</div>
              <div className="flex justify-between py-1 text-xs text-[#A79C92]">
                AliStore Центр <span className={inStock ? 'text-lime' : 'text-[#E5B23C]'}>{inStock ? `● ${product.availableUnits} шт` : '○ под заказ'}</span>
              </div>
            </div>

            {/* specs */}
            {specs.length > 0 && (
              <>
                <div className="mt-5 mb-2 font-display text-[15px] font-bold">Характеристики</div>
                {specs.map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-[#221E19] py-2.5 text-[13px]">
                    <span className="text-[#8A7F76]">{k}</span>
                    <span className="text-[#D8CFC6]">{String(v)}</span>
                  </div>
                ))}
              </>
            )}

            {/* reviews summary */}
            <div className="mt-5 flex items-center">
              <span className="font-display text-[15px] font-bold">Отзывы</span>
              <span className="ml-auto text-[13px] text-[#E5B23C]">★ 4.9 · 128</span>
            </div>

            {/* similar */}
            {related.length > 0 && (
              <>
                <div className="mt-5 mb-2.5 font-display text-[15px] font-bold">Похожие товары</div>
                <div className="flex gap-2.5 overflow-x-auto pb-1.5">
                  {related.map((r) => (
                    <Link key={r.id} href={`/product/${r.id}`} className="w-[120px] flex-shrink-0">
                      <div className="grid h-[92px] place-items-center rounded-[12px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display text-3xl font-extrabold text-white/10">{r.name.slice(0, 1)}</div>
                      <div className="mt-1.5 text-[11px] leading-tight text-[#D8CFC6]">{r.name}</div>
                      <div className="text-xs font-bold">{som(r.price)}</div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* sticky add-to-cart bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 border-t border-[#2E2822] bg-[#1A1611] px-4 pb-6 pt-3">
          <div>
            <div className="font-display text-lg font-extrabold">{som(product.price)}</div>
            <div className="text-[10px] text-[#8A7F76]">{inStock ? 'в наличии' : 'под заказ'}</div>
          </div>
          <button
            type="button"
            disabled={!inStock}
            onClick={addToCart}
            className={`ml-auto rounded-[12px] px-8 py-3.5 text-[15px] font-bold transition ${added ? 'bg-success text-white' : 'bg-lime text-lime-ink'} disabled:bg-[#3A342E] disabled:text-[#6E645C]`}
          >
            {added ? 'Добавлено ✓' : 'В корзину'}
          </button>
        </div>
      </div>
    </div>
  );
}
