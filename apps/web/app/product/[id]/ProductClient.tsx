"use client";

import Image from "next/image";
import Link from "next/link";
import {
  GitCompareArrows,
  Heart,
  ImageOff,
  ShoppingBag,
  Star,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ProductCard, productImage, productImages, productSpecEntries } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import MobileProduct from "@/components/mobile/MobileProduct";
import {
  createProductReview,
  fetchProductReviews,
  fetchProductWithRelated,
  type CatalogProduct,
  type ProductReviews,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useCompare } from "@/lib/compare";
import { useFavorites } from "@/lib/favorites";
import { conditionLabel, som } from "@/lib/format";

export default function ProductPage({ params }: { params: { id: string } }) {
  const { add } = useCart();
  const favorites = useFavorites();
  const compare = useCompare();
  const { user, hydrated, authed } = useAuth();
  const [product, setProduct] = useState<CatalogProduct | null | "missing">(
    null,
  );
  const [similar, setSimilar] = useState<CatalogProduct[]>([]);
  const [variants, setVariants] = useState<CatalogProduct[]>([]);
  const [reviews, setReviews] = useState<ProductReviews | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: "" });
  const [reviewMsg, setReviewMsg] = useState("");
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchProductWithRelated(params.id),
      fetchProductReviews(params.id).catch(() => null),
    ])
      .then(([detail, nextReviews]) => {
        if (!active) return;
        setProduct(detail.product ?? "missing");
        setSimilar(detail.related);
        setVariants(detail.variants);
        setReviews(nextReviews);
      })
      .catch(() => active && setProduct("missing"));
    return () => {
      active = false;
    };
  }, [params.id]);

  if (product === null) return <StoreMessage>Загрузка товара...</StoreMessage>;
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

  const inStock = product.availableUnits > 0;
  const condition = conditionLabel(product.attrs);
  const specs = productSpecEntries(product);
  const reviewLabel = reviews?.count
    ? `${(reviews.avgRating ?? 0).toFixed(1)} · ${reviews.count} отзывов`
    : "Отзывов пока нет";

  function addToCart() {
    if (!product || product === "missing") return;
    add(
      {
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        stockLimit: product.availableUnits,
      },
      qty,
    );
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || product === "missing") return;
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
      <div className="md:hidden">
        <MobileProduct
          product={product}
          variants={variants}
          similar={similar}
          reviews={reviews}
        />
      </div>
      <div className="hidden min-h-screen bg-[#f5f5f7] text-[#0f0f0f] [font-family:Manrope,-apple-system,BlinkMacSystemFont,sans-serif] md:block">
        <SiteHeader />
        <main className="mx-auto max-w-[1400px] px-5 py-8">
          <nav
            className="mb-7 flex flex-wrap items-center gap-2 text-xs text-[#8A7F76]"
            aria-label="Хлебные крошки"
          >
            <Link href="/">Главная</Link>
            <span>/</span>
            <Link href="/catalog">Каталог</Link>
            <span>/</span>
            <span className="text-[#6E645C]">{product.name}</span>
          </nav>
          <section className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
            <div>
              <div className="relative aspect-square max-h-[610px] overflow-hidden rounded-[22px] border border-[#E7DDD3] bg-gradient-to-br from-white to-[#F2ECE5] shadow-soft">
                {productImage(product) ? <Image src={productImage(product)!} alt={product.name} fill priority sizes="(max-width: 1024px) 92vw, 560px" className="object-contain p-10 sm:p-16" /> : <span className="flex h-full flex-col items-center justify-center gap-3 text-[#8A7F76]"><ImageOff size={42} /><span>Фото готовится</span></span>}
                <span className="absolute left-5 top-5 rounded-full border border-coral/25 bg-tint px-3 py-1.5 text-xs font-semibold text-deep">
                  {condition}
                </span>
              </div>
              {productImages(product).length > 1 && <div className="mt-3 grid grid-cols-4 gap-3">
                {productImages(product).map((src, index) => (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    className={`relative aspect-square overflow-hidden rounded-[13px] border bg-white ${index === 0 ? "border-coral" : "border-[#DED3C8]"}`}
                    aria-label={`Фото товара ${index + 1}`}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="120px"
                      className="object-contain p-3 opacity-80"
                    />
                  </button>
                ))}
              </div>}
            </div>

            <div className="pt-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#8A7F76]">
                  {product.sku}
                </span>
              </div>
              <h1 className="mt-5 font-display text-3xl font-bold leading-tight sm:text-4xl">
                {product.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#6E645C]">
                <span className="flex items-center gap-1 text-deep">
                  <Star size={16} fill="currentColor" /> {reviewLabel}
                </span>
                <span>·</span>
                <span>{product.category}</span>
              </div>
              <div className="mt-7 font-display text-4xl font-extrabold text-ink">
                {som(product.price)}
              </div>
              {typeof product.attrs?.financingText === "string" && <div className="mt-2 text-sm text-deep">{product.attrs.financingText}</div>}
              <div
                className={`mt-5 flex items-center gap-2 text-sm ${inStock ? "text-[#7ee2a0]" : "text-[#f4c27d]"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${inStock ? "bg-[#22c55e] shadow-[0_0_10px_#22c55e]" : "bg-[#e5b23c]"}`}
                />
                {inStock
                  ? `В наличии · ${product.availableUnits} шт.`
                  : "Доступен под заказ"}
              </div>

              {variants.length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 text-xs font-semibold uppercase text-[#8A7F76]">
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
                        className="rounded-[10px] border border-[#DED3C8] bg-white px-3 py-2 text-sm text-[#6E645C] hover:border-coral"
                      >
                        {variantLabel(variant)} · {som(variant.price)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {Boolean(product.bundleComponents?.length) && (
                <div className="mt-6 rounded-[12px] border border-[#DED3C8] bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-[#8A7F76]">
                    В комплекте
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    {product.bundleComponents?.map((component) => (
                      <div
                        key={component.productId}
                        className="flex justify-between gap-4 text-sm"
                      >
                        <span>{component.name}</span>
                        <span className="font-mono text-[#6E645C]">
                          × {component.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-7 grid grid-cols-[auto_1fr] gap-3">
                <div className="flex items-center rounded-[12px] border border-[#DED3C8] bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setQty((value) => Math.max(1, value - 1))}
                    className="grid h-10 w-10 place-items-center rounded-[9px] hover:bg-sand"
                    aria-label="Уменьшить количество"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-display font-semibold">
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={qty >= product.availableUnits}
                    onClick={() => setQty((value) => Math.min(product.availableUnits, value + 1))}
                    className="grid h-10 w-10 place-items-center rounded-[9px] hover:bg-sand"
                    aria-label="Увеличить количество"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={addToCart}
                  disabled={!inStock}
                  className={`flex items-center justify-center gap-2 rounded-[12px] px-5 font-semibold transition disabled:bg-[#E7DDD3] disabled:text-[#8A7F76] ${added ? "bg-success text-white" : "bg-coral text-white hover:bg-deep"}`}
                >
                  <ShoppingBag size={18} />
                  {added ? "Добавлено" : "В корзину"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => favorites.toggle(product.id)}
                  className={`flex items-center justify-center gap-2 rounded-[12px] border py-3 text-sm ${favorites.has(product.id) ? "border-coral bg-tint text-deep" : "border-[#DED3C8] bg-white text-[#6E645C]"}`}
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
                  className={`flex items-center justify-center gap-2 rounded-[12px] border py-3 text-sm ${compare.has(product.id) ? "border-coral bg-tint text-deep" : "border-[#DED3C8] bg-white text-[#6E645C]"}`}
                >
                  <GitCompareArrows size={17} />
                  Сравнить
                </button>
              </div>

              <div className="mt-7 grid gap-1 border-t border-[#E7DDD3] pt-5">
                {['warranty','deliveryText','pickupText','returnPolicy'].map((key) => typeof product.attrs?.[key] === 'string' ? <div key={key} className="py-2 text-sm text-[#6E645C]">{String(product.attrs[key])}</div> : null)}
              </div>
            </div>
          </section>

          <section className="pt-24">
            <div className="text-xs uppercase tracking-[0.16em] text-deep">
              Технические детали
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold">
              Характеристики
            </h2>
            <div className="mt-7 overflow-hidden rounded-[18px] border border-[#E7DDD3] bg-white shadow-soft">
              {specs.length ? (
                specs.map(([key, value]) => (
                  <div
                    key={key}
                    className="grid gap-2 border-b border-[#E7DDD3] px-5 py-4 text-sm last:border-0 sm:grid-cols-[220px_1fr]"
                  >
                    <span className="text-[#8A7F76]">{key}</span>
                    <span className="text-ink">{String(value)}</span>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-[#8A7F76]">
                  Подробные характеристики уточняются
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-8 pt-24 lg:grid-cols-[1fr_420px]">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-deep">
                Опыт покупателей
              </div>
              <h2 className="mt-2 font-display text-3xl font-bold">Отзывы</h2>
              <div className="mt-7 grid gap-3">
                {reviews?.items.length ? (
                  reviews.items.map((review) => (
                    <article
                      key={review.id}
                      className="rounded-[18px] border border-[#E7DDD3] bg-white p-5 shadow-soft"
                    >
                      <div className="flex items-center gap-3">
                        <strong>{review.customerName}</strong>
                        <span className="ml-auto text-deep">
                          {"★".repeat(review.rating)}
                        </span>
                      </div>
                      {review.text && (
                        <p className="mt-3 text-sm leading-6 text-[#6E645C]">
                          {review.text}
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-[#E7DDD3] bg-white p-7 text-[#6E645C]">
                    Будьте первым, кто оставит отзыв об этом товаре.
                  </div>
                )}
              </div>
            </div>
            <div className="h-fit rounded-[18px] border border-[#E7DDD3] bg-white p-6 shadow-soft">
              <h3 className="font-display text-lg font-semibold">
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
                    className="rounded-[11px] border border-[#DED3C8] bg-white px-3 py-3 text-sm outline-none"
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
                    className="resize-none rounded-[11px] border border-[#DED3C8] bg-white p-3 text-sm outline-none focus:border-coral"
                  />
                  <button className="rounded-[12px] bg-coral py-3 text-sm font-bold text-white">
                    Опубликовать
                  </button>
                  {reviewMsg && (
                    <p className="text-xs text-[#6E645C]">{reviewMsg}</p>
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
                  <div className="text-xs uppercase tracking-[0.16em] text-deep">
                    Вам может подойти
                  </div>
                  <h2 className="mt-2 font-display text-3xl font-bold">
                    Похожие товары
                  </h2>
                </div>
                <Link href="/catalog" className="text-sm text-deep">
                  Весь каталог
                </Link>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {similar.slice(0, 4).map((item) => (
                  <ProductCard key={item.id} product={item} />
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

function Perk({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm text-[#6E645C]">
      <span className="text-deep">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
function StoreMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sand text-[#6E645C]">
      <SiteHeader />
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
