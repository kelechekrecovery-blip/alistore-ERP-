"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  GitCompareArrows,
  Heart,
  RotateCcw,
  ShoppingBag,
  Star,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ProductCard, productImage, productImages, productSpecEntries } from "@/components/ProductCard";
import { ProductVisualFallback } from "@/components/ProductVisualFallback";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusPill } from "@/components/ui/Badge";
import MobileProduct from "@/components/mobile/MobileProduct";
import {
  createProductReview,
  fetchProductReviews,
  fetchProductWithRelated,
  type CatalogProduct,
  type ProductReviews,
} from "@/lib/api";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { TO_ORDER_CART_QTY_CAP, useCart } from "@/lib/cart";
import { useCompare } from "@/lib/compare";
import { useFavorites } from "@/lib/favorites";
import { conditionLabel, som } from "@/lib/format";
import { availabilityLabel, catalogAvailability } from "@/lib/to-order";

export default function ProductPage({ params }: { params: { id: string } }) {
  const { add } = useCart();
  const favorites = useFavorites();
  const compare = useCompare();
  const { user, hydrated, authed } = useAuth();
  const [product, setProduct] = useState<CatalogProduct | null | "missing" | "unavailable">(
    null,
  );
  const [similar, setSimilar] = useState<CatalogProduct[]>([]);
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [reviews, setReviews] = useState<ProductReviews | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: "" });
  const [reviewMsg, setReviewMsg] = useState("");
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    let active = true;
    fetchProductWithRelated(params.id)
      .then(async (detail) => {
        if (!active) return;
        setProduct(detail.product ?? "missing");
        setSimilar(detail.related);
        setVariants(detail.variants);
        if (!detail.product) {
          setReviews(null);
          return;
        }
        track('product_view', { productId: detail.product.id });
        const nextReviews = await fetchProductReviews(detail.product.id).catch(() => null);
        if (active) setReviews(nextReviews);
      })
      .catch(() => active && setProduct("unavailable"));
    return () => {
      active = false;
    };
  }, [params.id]);

  if (product === null) return <ProductLoadingSkeleton />;
  if (product === "missing")
    return (
      <StoreMessage>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Товар не найден
          </h1>
          <Link href="/catalog" className="mt-4 inline-block text-deep">
            Вернуться в каталог
          </Link>
        </div>
      </StoreMessage>
    );
  if (product === "unavailable")
    return (
      <StoreMessage>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-ink">Товар временно недоступен</h1>
          <p className="mt-2 text-sm text-muted">Сервис каталога не ответил. Попробуйте обновить страницу.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-btn bg-coral px-4 py-2 text-sm font-bold text-white">Повторить</button>
        </div>
      </StoreMessage>
    );

  const availability = catalogAvailability(product);
  const inStock = availability.isInStock;
  const toOrder = availability.isToOrder;
  const buyable = availability.buyable;
  // A to-order line has no stock ceiling — the `+` control must not clamp to
  // `availableUnits` (always 0 for it). Cap at `TO_ORDER_CART_QTY_CAP`
  // instead (see its doc comment in lib/cart.tsx for why 10).
  const qtyCap = toOrder ? TO_ORDER_CART_QTY_CAP : product.availableUnits;
  const condition = conditionLabel(product.attrs);
  const specs = productSpecEntries(product);
  const reviewLabel = reviews?.count
    ? `${(reviews.avgRating ?? 0).toFixed(1)} · ${reviews.count} отзывов`
    : "Отзывов пока нет";

  function addToCart() {
    if (!product || typeof product === "string") return;
    if (!buyable) return;
    add(
      {
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        stockLimit: qtyCap,
        supplyMode: toOrder ? "to_order" : "own_stock",
        supplyLeadDays: toOrder ? availability.leadTimeDays : null,
        orderable: buyable,
      },
      qty,
    );
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || typeof product === "string") return;
    setReviewMsg("Сохраняем...");
    try {
      await authed((token) =>
        createProductReview(product.id, reviewForm, token),
      );
      setReviewForm({ rating: 5, text: "" });
      setReviews(await fetchProductReviews(product.id));
      setReviewMsg("Спасибо, отзыв отправлен на модерацию.");
    } catch (error) {
      setReviewMsg(
        error instanceof Error ? error.message : "Не удалось сохранить отзыв",
      );
    }
  }

  return (
    <>
      {/* Разметка Product/Offer/BreadcrumbList переехала в серверный
          `page.tsx`: роботы не выполняют JS, поэтому отсюда её было не видно. */}
      <div className="md:hidden">
        <MobileProduct
          product={product}
          variants={variants}
          similar={similar}
          reviews={reviews}
        />
      </div>
      <div className="hidden min-h-screen bg-[#0b0a08] font-sans text-[#e5dcd3] md:block">
        <SiteHeader variant="design3" />
        <main className="mx-auto max-w-[1400px] px-5 py-8">
          <nav
            className="mb-7 flex flex-wrap items-center gap-2 text-xs text-white/40"
            aria-label="Хлебные крошки"
          >
            <Link href="/">Главная</Link>
            <span>/</span>
            <Link href="/catalog">Каталог</Link>
            <span>/</span>
            <span className="text-white/55">{product.name}</span>
          </nav>
          <section className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
            <div>
              {/* Светлая подложка оправдана под фотографией — товары снимают на
                  светлом фоне. Но когда фото нет, она превращалась в бежевый
                  квадрат 610×610 на странице #0b0a08: самый крупный и самый
                  светлый элемент экрана указывал на пустоту. Скелетон загрузки
                  строкой ~507 уже держит тёмную поверхность — пустое состояние
                  теперь ведёт себя так же. */}
              <div className={`relative aspect-square max-h-[610px] overflow-hidden rounded-[22px] border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,.4)] ${productImage(product) ? 'bg-gradient-to-br from-[#ede6dc] to-[#d8cfc6]' : 'bg-white/[.04]'}`}>
                {productImage(product) ? <Image src={(productImages(product)[activeImage] ?? productImage(product))!} alt={product.name} fill priority sizes="(max-width: 1024px) 92vw, 560px" className="object-contain p-10 sm:p-16" /> : <ProductVisualFallback category={product.category} />}
                <span className="absolute left-5 top-5 rounded-full border border-coral/25 bg-tint px-3 py-1.5 text-xs font-semibold text-deep">
                  {condition}
                </span>
              </div>
              {productImages(product).length > 1 && <div className="mt-3 grid grid-cols-4 gap-3">
                {productImages(product).map((src, index) => (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    aria-pressed={index === activeImage}
                    className={`relative aspect-square overflow-hidden rounded-[13px] border bg-[#201b17] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 ${index === activeImage ? "border-coral" : "border-white/10 hover:border-white/30"}`}
                    aria-label={`Фото товара ${index + 1}`}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="120px"
                      className={`object-contain p-3 transition ${index === activeImage ? "opacity-100" : "opacity-70"}`}
                    />
                  </button>
                ))}
              </div>}
            </div>

            <div className="pt-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white/40">
                  {product.sku}
                </span>
              </div>
              <h1 className="mt-5 font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
                {product.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/50">
                <span className="flex items-center gap-1 text-[#ff9a6e]">
                  <Star size={16} fill="currentColor" /> {reviewLabel}
                </span>
                <span>·</span>
                <span>{product.category}</span>
              </div>
              <div className="mt-7 font-display text-4xl font-extrabold text-white">
                {som(product.price)}
              </div>
              {/* Вилка сроков, а не один назначенный платёж: покупатель сам
                  выбирает, за сколько месяцев ему удобно. Все ступени считает
                  сервер по договорным условиям владельца — витрина не имеет
                  права придумать финансовое условие.
                  Оформляют рассрочку в магазине: публичного API у партнёров
                  (Payda/Оптима, O!Market/O!Bank, ZERO/А Банк, M+) нет. */}
              {product.installmentSteps && product.installmentSteps.length > 0 && (
                <div className="mt-4 rounded-[14px] border border-white/10 bg-white/[.03] p-4">
                  <div className="text-[13px] font-semibold text-white">Рассрочка 0%</div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {product.installmentSteps.map((step) => (
                      <div
                        key={step.months}
                        className="rounded-[10px] border border-white/10 bg-white/[.04] px-3 py-2"
                      >
                        <div className="font-display text-[15px] font-bold text-[#c6ff3d]">
                          {som(step.monthlySom)}<span className="text-[11px] font-medium text-white/50">/мес</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/50">{step.months} мес · {step.providers.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 text-[11px] text-white/50">
                    Оформляется в магазине при получении заказа.
                  </div>
                  {/* QR загружает владелец в ERP. Показываем только провайдеров,
                      которые тянут эту цену и у которых код действительно есть:
                      прислать покупателя с кодом, по которому откажут, хуже,
                      чем не показать ничего. */}
                  {product.installmentProviders && product.installmentProviders.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <div className="text-[12px] font-semibold text-white">Где оформить</div>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {product.installmentProviders.map((provider) => (
                          <figure key={provider.id} className="w-[92px] text-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={provider.qrUrl}
                              alt={`QR для оформления рассрочки ${provider.label}`}
                              width={92}
                              height={92}
                              loading="lazy"
                              className="h-[92px] w-[92px] rounded-[10px] bg-white object-contain p-1.5"
                            />
                            <figcaption className="mt-1 text-[11px] text-white/55">{provider.label}</figcaption>
                          </figure>
                        ))}
                      </div>
                      <div className="mt-2 text-[11px] text-white/50">
                        Отсканируйте код нужного банка — заявку оформит продавец.
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Продавец — та же метка, что на карточке каталога. */}
              {product.seller && (
                <div className="mt-3 text-sm text-white/55">
                  Продавец: <span className="font-semibold text-white">{product.seller.name}</span>
                </div>
              )}
              {typeof product.bonusPoints === "number" && product.bonusPoints > 0 && (
                <div className="mt-3 text-sm text-white/55">
                  Около <span className="font-semibold text-white">{product.bonusPoints.toLocaleString("ru-RU")}</span> бонусов до скидок и доставки
                </div>
              )}
              {!product.installmentSteps?.length && typeof product.attrs?.financingText === "string" && <div className="mt-2 text-sm text-[#c6ff3d]">{product.attrs.financingText}</div>}
              {inStock ? (
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-success">
                  <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_#2e7d46]" />
                  {availabilityLabel(availability, product.availableUnits)}
                </div>
              ) : toOrder ? (
                <div className="mt-5">
                  <StatusPill status="info">{availabilityLabel(availability, product.availableUnits)}</StatusPill>
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-warn">
                  <span className="h-2 w-2 rounded-full bg-warn" />
                  {availabilityLabel(availability, product.availableUnits)}
                </div>
              )}

              {variants.length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 text-xs font-semibold uppercase text-subtle">
                    Другие варианты
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-[10px] border border-coral bg-tint px-3 py-2 text-sm font-semibold text-deep">
                      {variantLabel(product)}
                    </span>
                    {variants.map((variant) => (
                      <Link
                        key={variant.id}
                        href={`/product/${variant.id}`}
                    className="rounded-[10px] border border-white/10 bg-white/[.05] px-3 py-2 text-sm text-white/55 hover:border-coral"
                      >
                        {variantLabel(variant)} · {som(variant.price)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {Boolean(product.bundleComponents?.length) && (
                <div className="mt-6 rounded-[16px] border border-white/10 bg-white/[.05] p-4">
                  <div className="text-xs font-semibold uppercase text-subtle">
                    В комплекте
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    {product.bundleComponents?.map((component) => (
                      <div
                        key={component.productId}
                        className="flex justify-between gap-4 text-sm"
                      >
                        <span>{component.name}</span>
                        <span className="font-mono text-faint">
                          × {component.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-7 grid grid-cols-[auto_1fr] gap-3">
                <div className="flex items-center rounded-[12px] border border-white/10 bg-white/[.05] p-1">
                  <button
                    type="button"
                    onClick={() => setQty((value) => Math.max(1, value - 1))}
                    className="grid h-11 w-11 place-items-center rounded-btn hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40"
                    aria-label="Уменьшить количество"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-display font-semibold">
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={qty >= qtyCap}
                    onClick={() => setQty((value) => Math.min(qtyCap, value + 1))}
                    className="grid h-11 w-11 place-items-center rounded-btn hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40"
                    aria-label="Увеличить количество"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={addToCart}
                  disabled={!buyable}
                  data-testid="pdp-add-to-cart"
                  className={`flex items-center justify-center gap-2 rounded-[12px] px-5 font-semibold transition disabled:bg-linen disabled:text-subtle ${added ? "bg-success text-white" : "bg-coral text-white hover:bg-deep"}`}
                >
                  <ShoppingBag size={18} />
                  {added ? "Добавлено" : toOrder ? "Заказать" : "В корзину"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => favorites.toggle(product.id)}
                  className={`flex items-center justify-center gap-2 rounded-[12px] border py-3 text-sm ${favorites.has(product.id) ? "border-coral bg-coral/15 text-[#ff9a6e]" : "border-white/10 bg-white/[.05] text-white/55"}`}
                >
                  <Heart
                    size={17}
                    fill={favorites.has(product.id) ? "currentColor" : "none"}
                  />
                  Избранное
                </button>
                <button
                  type="button"
                  onClick={() => compare.toggle(product.id)}
                  className={`flex items-center justify-center gap-2 rounded-[12px] border py-3 text-sm ${compare.has(product.id) ? "border-coral bg-coral/15 text-[#ff9a6e]" : "border-white/10 bg-white/[.05] text-white/55"}`}
                >
                  <GitCompareArrows size={17} />
                  Сравнить
                </button>
              </div>

              <Link href="/trade-in" className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-[#ff7a4d]/25 bg-coral/10 px-4 py-3 text-sm transition hover:border-coral">
                <span className="flex items-center gap-2 font-semibold text-white"><RotateCcw size={17} className="text-coral" /> Есть старое устройство? Trade-in со скидкой</span>
                <ArrowRight size={16} className="text-coral" />
              </Link>

              <div className="mt-7 grid gap-1 border-t border-white/10 pt-5">
                {['warranty','deliveryText','pickupText','returnPolicy'].map((key) => typeof product.attrs?.[key] === 'string' ? <div key={key} className="py-2 text-sm text-faint">{String(product.attrs[key])}</div> : null)}
              </div>
            </div>
          </section>

          <section className="pt-24">
            <div className="text-xs uppercase tracking-[0.16em] text-[#ff9a6e]">
              Технические детали
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold text-white">
              Характеристики
            </h2>
            <div className="mt-7 overflow-hidden rounded-[18px] border border-white/10 bg-white/[.04] shadow-[0_12px_30px_rgba(0,0,0,.35)]">
              {specs.length ? (
                specs.map(([key, value]) => (
                  <div
                    key={key}
                    className="grid gap-2 border-b border-white/[.08] px-5 py-4 text-sm last:border-0 sm:grid-cols-[220px_1fr]"
                  >
                    <span className="text-subtle">{key}</span>
                    <span className="text-white/80">{String(value)}</span>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-subtle">
                  Подробные характеристики уточняются
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-8 pt-24 lg:grid-cols-[1fr_420px]">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[#ff9a6e]">
                Опыт покупателей
              </div>
              <h2 className="mt-2 font-display text-3xl font-bold text-white">Отзывы</h2>
              <div className="mt-7 grid gap-3">
                {reviews?.items.length ? (
                  reviews.items.map((review) => (
                    <article
                      key={review.id}
                      className="rounded-[18px] border border-white/10 bg-white/[.04] p-5 shadow-[0_12px_30px_rgba(0,0,0,.35)]"
                    >
                      <div className="flex items-center gap-3">
                        <strong>{review.customerName}</strong>
                        <span className="ml-auto text-deep">
                          {"★".repeat(review.rating)}
                        </span>
                      </div>
                      {review.text && (
                        <p className="mt-3 text-sm leading-6 text-faint">
                          {review.text}
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-white/10 bg-white/[.04] p-7 text-white/50">
                    Будьте первым, кто оставит отзыв об этом товаре.
                  </div>
                )}
              </div>
            </div>
            <div className="h-fit rounded-[18px] border border-white/10 bg-white/[.04] p-6 shadow-[0_12px_30px_rgba(0,0,0,.35)]">
              <h3 className="font-display text-lg font-semibold text-white">
                Оставить отзыв
              </h3>
              {hydrated && user ? (
                <form onSubmit={submitReview} className="mt-5 grid gap-3">
                  <select
                    value={reviewForm.rating}
                    onChange={(event) =>
                      setReviewForm((form) => ({
                        ...form,
                        rating: Number(event.target.value),
                      }))
                    }
                    className="rounded-btn border border-white/10 bg-[#201b17] px-3 py-3 text-sm text-white outline-none focus:border-coral focus-visible:ring-2 focus-visible:ring-coral/30"
                  >
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating} из 5
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={reviewForm.text}
                    onChange={(event) =>
                      setReviewForm((form) => ({
                        ...form,
                        text: event.target.value,
                      }))
                    }
                    rows={4}
                    maxLength={500}
                    placeholder="Расскажите о покупке"
                    className="resize-none rounded-[11px] border border-white/10 bg-[#201b17] p-3 text-sm text-white outline-none focus:border-coral"
                  />
                  <button className="rounded-[12px] bg-coral py-3 text-sm font-bold text-white">
                    Опубликовать
                  </button>
                  {reviewMsg && (
                    <p className="text-xs text-faint">{reviewMsg}</p>
                  )}
                </form>
              ) : (
                <Link
                  href={`/login?next=/product/${product.id}`}
                  className="mt-5 inline-flex rounded-[12px] bg-coral px-5 py-3 text-sm font-bold text-white"
                >
                  Войти и оставить отзыв
                </Link>
              )}
            </div>
          </section>

          {similar.length > 0 && (
            <section className="pt-24">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-[#ff9a6e]">
                    Вам может подойти
                  </div>
                  <h2 className="mt-2 font-display text-3xl font-bold text-white">
                    Похожие товары
                  </h2>
                </div>
                <Link href="/catalog" className="text-sm text-[#ff9a6e]">
                  Весь каталог
                </Link>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {similar.slice(0, 4).map((item) => (
                  <ProductCard key={item.id} product={item} variant="design3" />
                ))}
              </div>
            </section>
          )}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}

function ProductLoadingSkeleton() {
  return (
    <div
      className="min-h-screen bg-[#0b0a08] font-sans text-white"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <SiteHeader variant="design3" />
      <main className="mx-auto max-w-[1400px] px-5 py-8">
        <h1 className="sr-only">Загружаем товар</h1>
        <p className="mb-4 text-sm text-white/60">Загружаем информацию о товаре...</p>
        <div className="mb-7 h-4 w-56 animate-pulse rounded-full bg-linen" />
        <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
          <div className="aspect-square max-h-[610px] animate-pulse rounded-[22px] border border-white/10 bg-white/[.04]" />
          <div className="space-y-4 pt-1">
            <div className="h-4 w-24 animate-pulse rounded-full bg-linen" />
            <div className="h-9 w-3/4 animate-pulse rounded-lg bg-linen" />
            <div className="h-4 w-40 animate-pulse rounded-full bg-linen" />
            <div className="h-10 w-48 animate-pulse rounded-lg bg-linen" />
            <div className="h-12 w-full animate-pulse rounded-btn bg-linen" />
            <div className="h-24 w-full animate-pulse rounded-card bg-linen" />
          </div>
        </div>
      </main>
    </div>
  );
}
function StoreMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0b0a08] text-white/50">
      <SiteHeader variant="design3" />
      <div className="grid min-h-[70vh] place-items-center">{children}</div>
    </div>
  );
}
function variantLabel(product: CatalogProduct): string {
  const attrs = product.attrs ?? {};
  return (
    [
      attrs.color ?? attrs["цвет"],
      attrs.storage ?? attrs.memory ?? attrs["память"],
    ]
      .filter(Boolean)
      .map(String)
      .join(" · ") || product.sku
  );
}
