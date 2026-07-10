'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, GitCompareArrows, Heart, MapPin, RotateCcw, ShieldCheck, ShoppingBag, Star, Truck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ProductCard, productImage } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileProduct from '@/components/mobile/MobileProduct';
import { createProductReview, fetchProductReviews, fetchProductWithRelated, type CatalogProduct, type ProductReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useCompare } from '@/lib/compare';
import { useFavorites } from '@/lib/favorites';
import { conditionLabel, som } from '@/lib/format';

export default function ProductPage({ params }: { params: { id: string } }) {
  const { add } = useCart();
  const favorites = useFavorites();
  const compare = useCompare();
  const { user, hydrated, authed } = useAuth();
  const [product, setProduct] = useState<CatalogProduct | null | 'missing'>(null);
  const [similar, setSimilar] = useState<CatalogProduct[]>([]);
  const [reviews, setReviews] = useState<ProductReviews | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: '' });
  const [reviewMsg, setReviewMsg] = useState('');
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let active = true;
    Promise.all([fetchProductWithRelated(params.id), fetchProductReviews(params.id).catch(() => null)]).then(([detail, nextReviews]) => {
      if (!active) return;
      setProduct(detail.product ?? 'missing');
      setSimilar(detail.related);
      setReviews(nextReviews);
    }).catch(() => active && setProduct('missing'));
    return () => { active = false; };
  }, [params.id]);

  if (product === null) return <StoreMessage>Загрузка товара...</StoreMessage>;
  if (product === 'missing') return <StoreMessage><div className="text-center"><h1 className="font-display text-2xl font-bold text-white">Товар не найден</h1><Link href="/catalog" className="mt-4 inline-block text-[#fb9a4b]">Вернуться в каталог</Link></div></StoreMessage>;

  const inStock = product.availableUnits > 0;
  const condition = conditionLabel(product.attrs);
  const specs = Object.entries(product.attrs ?? {}).filter(([, value]) => typeof value === 'string' || typeof value === 'number');
  const reviewLabel = reviews?.count ? `${(reviews.avgRating ?? 0).toFixed(1)} · ${reviews.count} отзывов` : 'Отзывов пока нет';

  function addToCart() {
    if (!product || product === 'missing') return;
    add({ id: product.id, sku: product.sku, name: product.name, price: product.price }, qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || product === 'missing') return;
    setReviewMsg('Сохраняем...');
    try {
      await authed((token) => createProductReview(product.id, reviewForm, token));
      setReviewForm({ rating: 5, text: '' });
      setReviews(await fetchProductReviews(product.id));
      setReviewMsg('Спасибо, отзыв опубликован.');
    } catch (error) {
      setReviewMsg(error instanceof Error ? error.message : 'Не удалось сохранить отзыв');
    }
  }

  return <>
    <div className="lg:hidden"><MobileProduct product={product} similar={similar} reviews={reviews} /></div>
    <div className="hidden min-h-screen bg-[#0c0c17] text-[#f6f7fb] lg:block">
    <SiteHeader />
    <main className="mx-auto w-[min(1200px,92vw)] py-8 sm:py-12">
      <nav className="mb-7 flex flex-wrap items-center gap-2 text-xs text-[#6c7080]" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span>/</span><Link href="/catalog">Каталог</Link><span>/</span><span className="text-[#a2a6b6]">{product.name}</span></nav>
      <section className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
        <div>
          <div className="relative aspect-square max-h-[610px] overflow-hidden rounded-[24px] border border-white/[0.11] bg-[radial-gradient(circle_at_70%_12%,rgba(249,115,22,.16),transparent_42%),linear-gradient(150deg,#191932,#101021)]">
            <Image src={productImage(product)} alt={product.name} fill priority sizes="(max-width: 1024px) 92vw, 560px" className="object-contain p-10 sm:p-16" />
            <span className="absolute left-5 top-5 rounded-full border border-[#f97316]/30 bg-[#f97316]/15 px-3 py-1.5 text-xs font-semibold text-[#fb9a4b]">{condition}</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">{[productImage(product), '/products/p-iphone.png', '/products/p-samsung.png', productImage(product)].map((src, index) => <button key={`${src}-${index}`} type="button" className={`relative aspect-square overflow-hidden rounded-[13px] border bg-[#111120] ${index === 0 ? 'border-[#f97316]' : 'border-white/[0.09]'}`} aria-label={`Фото товара ${index + 1}`}><Image src={src} alt="" fill sizes="120px" className="object-contain p-3 opacity-80" /></button>)}</div>
        </div>

        <div className="pt-1">
          <div className="flex items-center gap-2"><span className="rounded-full border border-[#f97316]/30 bg-[#f97316]/15 px-3 py-1 text-xs text-[#fb9a4b]">Хит продаж</span><span className="text-xs text-[#6c7080]">{product.sku}</span></div>
          <h1 className="mt-5 font-display text-3xl font-bold leading-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#a2a6b6]"><span className="flex items-center gap-1 text-[#fb9a4b]"><Star size={16} fill="currentColor" /> {reviewLabel}</span><span>·</span><span>{product.category}</span></div>
          <div className="mt-7 font-display text-4xl font-bold text-white">{som(product.price)}</div>
          <div className="mt-2 text-sm text-[#fb9a4b]">Рассрочка 0-0-12 · от {som(Math.round(product.price / 12))} в месяц</div>
          <div className={`mt-5 flex items-center gap-2 text-sm ${inStock ? 'text-[#7ee2a0]' : 'text-[#f4c27d]'}`}><span className={`h-2 w-2 rounded-full ${inStock ? 'bg-[#22c55e] shadow-[0_0_10px_#22c55e]' : 'bg-[#e5b23c]'}`} />{inStock ? `В наличии · ${product.availableUnits} шт.` : 'Доступен под заказ'}</div>

          <div className="mt-7 grid grid-cols-[auto_1fr] gap-3">
            <div className="flex items-center rounded-full border border-white/[0.1] bg-white/[0.055] p-1"><button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/[0.07]" aria-label="Уменьшить количество">−</button><span className="min-w-8 text-center font-display font-semibold">{qty}</span><button type="button" onClick={() => setQty((value) => Math.min(99, value + 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/[0.07]" aria-label="Увеличить количество">+</button></div>
            <button type="button" onClick={addToCart} disabled={!inStock} className={`flex items-center justify-center gap-2 rounded-full px-5 font-semibold transition disabled:bg-white/[0.07] disabled:text-[#5f6372] ${added ? 'bg-[#22c55e] text-white' : 'bg-gradient-to-br from-[#f97316] to-[#ea580c] text-[#180f02] hover:brightness-110'}`}><ShoppingBag size={18} />{added ? 'Добавлено' : 'В корзину'}</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => favorites.toggle(product.id)} className={`flex items-center justify-center gap-2 rounded-full border py-3 text-sm ${favorites.has(product.id) ? 'border-[#f97316] text-[#fb9a4b]' : 'border-white/[0.12] text-[#a2a6b6]'}`}><Heart size={17} fill={favorites.has(product.id) ? 'currentColor' : 'none'} />Избранное</button>
            <button type="button" onClick={() => compare.toggle(product.id)} className={`flex items-center justify-center gap-2 rounded-full border py-3 text-sm ${compare.has(product.id) ? 'border-[#f97316] text-[#fb9a4b]' : 'border-white/[0.12] text-[#a2a6b6]'}`}><GitCompareArrows size={17} />Сравнить</button>
          </div>

          <div className="mt-7 grid gap-1 border-t border-white/[0.09] pt-5">
            <Perk icon={<ShieldCheck />}><b>Гарантия 12 месяцев</b> · цифровой талон в кабинете</Perk>
            <Perk icon={<Truck />}><b>Доставка 1–2 часа</b> по Бишкеку</Perk>
            <Perk icon={<MapPin />}><b>Самовывоз сегодня</b> из магазина AliStore</Perk>
            <Perk icon={<RotateCcw />}><b>Возврат 14 дней</b> по правилам магазина</Perk>
          </div>
        </div>
      </section>

      <section className="pt-24">
        <div className="text-xs uppercase tracking-[0.16em] text-[#fb9a4b]">Технические детали</div><h2 className="mt-2 font-display text-3xl font-bold">Характеристики</h2>
        <div className="mt-7 overflow-hidden rounded-[18px] border border-white/[0.09]">{specs.length ? specs.map(([key, value]) => <div key={key} className="grid gap-2 border-b border-white/[0.07] px-5 py-4 text-sm last:border-0 sm:grid-cols-[220px_1fr]"><span className="text-[#6c7080]">{key}</span><span className="text-[#d7d9e2]">{String(value)}</span></div>) : <div className="px-5 py-10 text-center text-[#6c7080]">Подробные характеристики уточняются</div>}</div>
      </section>

      <section className="grid gap-8 pt-24 lg:grid-cols-[1fr_420px]">
        <div><div className="text-xs uppercase tracking-[0.16em] text-[#fb9a4b]">Опыт покупателей</div><h2 className="mt-2 font-display text-3xl font-bold">Отзывы</h2><div className="mt-7 grid gap-3">{reviews?.items.length ? reviews.items.map((review) => <article key={review.id} className="rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-5"><div className="flex items-center gap-3"><strong>{review.customerName}</strong><span className="ml-auto text-[#fb9a4b]">{'★'.repeat(review.rating)}</span></div>{review.text && <p className="mt-3 text-sm leading-6 text-[#a2a6b6]">{review.text}</p>}</article>) : <div className="rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-7 text-[#a2a6b6]">Будьте первым, кто оставит отзыв об этом товаре.</div>}</div></div>
        <div className="h-fit rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-6"><h3 className="font-display text-lg font-semibold">Оставить отзыв</h3>{hydrated && user ? <form onSubmit={submitReview} className="mt-5 grid gap-3"><select value={reviewForm.rating} onChange={(event) => setReviewForm((form) => ({ ...form, rating: Number(event.target.value) }))} className="rounded-[11px] border border-white/[0.1] bg-[#111120] px-3 py-3 text-sm outline-none">{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} из 5</option>)}</select><textarea value={reviewForm.text} onChange={(event) => setReviewForm((form) => ({ ...form, text: event.target.value }))} rows={4} maxLength={500} placeholder="Расскажите о покупке" className="resize-none rounded-[11px] border border-white/[0.1] bg-[#111120] p-3 text-sm outline-none focus:border-[#f97316]" /><button className="rounded-full bg-[#f97316] py-3 text-sm font-bold text-[#180f02]">Опубликовать</button>{reviewMsg && <p className="text-xs text-[#a2a6b6]">{reviewMsg}</p>}</form> : <Link href={`/login?next=/product/${product.id}`} className="mt-5 inline-flex rounded-full bg-[#f97316] px-5 py-3 text-sm font-bold text-[#180f02]">Войти и оставить отзыв</Link>}</div>
      </section>

      {similar.length > 0 && <section className="pt-24"><div className="flex items-end justify-between"><div><div className="text-xs uppercase tracking-[0.16em] text-[#fb9a4b]">Вам может подойти</div><h2 className="mt-2 font-display text-3xl font-bold">Похожие товары</h2></div><Link href="/catalog" className="text-sm text-[#fb9a4b]">Весь каталог</Link></div><div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">{similar.slice(0,4).map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
    </main>
    <SiteFooter />
    </div>
  </>;
}

function Perk({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <div className="flex items-center gap-3 py-2 text-sm text-[#a2a6b6]"><span className="text-[#fb9a4b]">{icon}</span><span>{children}</span></div>; }
function StoreMessage({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-[#0c0c17] text-[#a2a6b6]"><SiteHeader /><div className="grid min-h-[70vh] place-items-center">{children}</div></div>; }
