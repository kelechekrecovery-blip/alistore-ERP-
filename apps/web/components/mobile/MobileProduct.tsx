"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { productImage, productSpecEntries } from "@/components/ProductCard";
import { ImageOff } from "lucide-react";
import { som, conditionLabel } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { useFavorites } from "@/lib/favorites";
import type { CatalogProduct, ProductReviews } from "@/lib/api";

const VARIANT_KEYS = [
  "color",
  "цвет",
  "memory",
  "память",
  "storage",
  "capacity",
  "объ",
  "ram",
  "накопитель",
];

function stars(n: number) {
  return "★".repeat(Math.max(0, Math.round(n))).padEnd(5, "☆");
}

export default function MobileProduct({
  product,
  variants: siblingVariants,
  similar,
  reviews,
}: {
  product: CatalogProduct;
  variants: CatalogProduct[];
  similar: CatalogProduct[];
  reviews: ProductReviews | null;
}) {
  const router = useRouter();
  const { add } = useCart();
  const { has: faved, toggle: toggleFav } = useFavorites();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const attrs = product.attrs ?? {};
  const inStock = product.availableUnits > 0;
  const oldPrice = Number(attrs.oldPrice ?? attrs.old_price ?? 0) || 0;
  const optionValues = Object.entries(attrs)
    .filter(([k]) => VARIANT_KEYS.some((vk) => k.toLowerCase().includes(vk)))
    .map(([, v]) => String(v))
    .filter(Boolean);
  const specs = productSpecEntries(product);

  function addToCart() {
    if (!inStock) return;
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

  return (
    <MobileFrame active="catalog">
      <div className="pb-6">
        {/* hero */}
        <div className="relative h-[260px] bg-gradient-to-br from-[#2A2620] to-[#16130F]">
          {productImage(product) ? <Image src={productImage(product)!} alt={product.name} fill sizes="440px" priority className="object-contain p-8" /> : <span className="flex h-full flex-col items-center justify-center gap-2 text-[#8A7F76]"><ImageOff size={38} /><span>Фото готовится</span></span>}
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="absolute left-3 top-3 grid h-[34px] w-[34px] place-items-center rounded-full bg-[#14110E]/55 text-white"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => toggleFav(product.id)}
            aria-label={
              faved(product.id) ? "Убрать из избранного" : "В избранное"
            }
            className="absolute right-3 top-3 grid h-[34px] w-[34px] place-items-center rounded-full bg-[#14110E]/55"
          >
            <span className={faved(product.id) ? "text-coral" : "text-white"}>
              {faved(product.id) ? "♥" : "♡"}
            </span>
          </button>
        </div>

        <div className="px-4 pt-[18px]">
          <span className="rounded-[6px] bg-coral px-[9px] py-[3px] text-[11px] font-bold text-white">
            {conditionLabel(attrs)}
          </span>
          <div className="mt-2.5 font-display text-[22px] font-extrabold leading-[1.15] text-white">
            {product.name}
          </div>
          <div className="mt-2.5 flex items-baseline gap-2.5">
            <span className="font-display text-[26px] font-extrabold text-white">
              {som(product.price)}
            </span>
            {oldPrice > product.price && (
              <span className="text-[15px] text-[#8A7F76] line-through">
                {som(oldPrice)}
              </span>
            )}
          </div>
          {typeof attrs.financingText === "string" && <div className="mt-1.5 text-[13px] text-lime">{attrs.financingText}</div>}

          {/* add to cart */}
          <div className="mt-4 flex gap-2">
            <div className="flex items-center gap-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] px-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="text-lg text-white"
              >
                −
              </button>
              <span className="w-5 text-center font-mono text-[14px] text-white">
                {qty}
              </span>
              <button
                type="button"
                disabled={qty >= product.availableUnits}
                onClick={() => setQty((q) => Math.min(product.availableUnits, q + 1))}
                className="text-lg text-white disabled:opacity-30"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={addToCart}
              disabled={!inStock}
              className={`flex-1 rounded-[12px] py-3 text-center text-[15px] font-bold transition ${
                added
                  ? "bg-success text-white"
                  : inStock
                    ? "bg-lime text-lime-ink"
                    : "bg-[#2E2822] text-[#6E645C]"
              }`}
            >
              {added ? "Добавлено ✓" : inStock ? "В корзину" : "Под заказ"}
            </button>
          </div>

          {/* variants */}
          {(siblingVariants.length > 0 || optionValues.length > 0) && (
            <>
              <div className="mb-2 mt-[18px] text-[12px] text-[#A79C92]">
                Цвет / память
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-[10px] border border-lime bg-lime/10 px-3.5 py-2.5 text-[13px] text-lime">
                  {optionValues.join(" · ") || product.sku}
                </span>
                {siblingVariants.map((variant) => (
                  <Link
                    key={variant.id}
                    href={`/product/${variant.id}`}
                    className="rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3.5 py-2.5 text-[13px] text-[#D8CFC6]"
                  >
                    {variantOptionLabel(variant)}
                  </Link>
                ))}
              </div>
            </>
          )}

          {Boolean(product.bundleComponents?.length) && (
            <div className="mt-[18px] rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="mb-2 text-[13px] font-semibold text-white">
                В комплекте
              </div>
              {product.bundleComponents?.map((component) => (
                <div
                  key={component.productId}
                  className="flex justify-between py-1 text-[12px] text-[#A79C92]"
                >
                  <span>{component.name}</span>
                  <span>× {component.qty}</span>
                </div>
              ))}
            </div>
          )}

          {/* trust row */}
          <div className="mt-[18px] grid grid-cols-2 gap-2">
            {['warranty','deliveryText','pickupText','returnPolicy'].map((key) => typeof attrs[key] === 'string' ? String(attrs[key]) : null).filter(Boolean).map((t) => (
              <div
                key={t}
                className="rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-[12px] text-[#D8CFC6]"
              >
                {t}
              </div>
            ))}
          </div>

          {/* availability */}
          <div className="mt-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5">
            <div className="mb-2 text-[13px] font-semibold text-white">
              Наличие
            </div>
            <div className="flex justify-between py-1 text-[12px] text-[#A79C92]">
              Доступно к заказу{" "}
              <span style={{ color: inStock ? "#C6FF3D" : "#FF8A7A" }}>
                ● {inStock ? `${product.availableUnits} шт` : "нет"}
              </span>
            </div>
          </div>

          {/* specs */}
          {specs.length > 0 && (
            <>
              <div className="mb-2 mt-5 font-display text-[15px] font-bold text-white">
                Характеристики
              </div>
              {specs.map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between border-b border-[#221E19] py-[9px] text-[13px]"
                >
                  <span className="text-[#8A7F76]">{k}</span>
                  <span className="text-[#D8CFC6]">{String(v)}</span>
                </div>
              ))}
            </>
          )}

          {/* description */}
          {typeof attrs.description === "string" &&
            attrs.description.trim() && (
              <>
                <div className="mb-2 mt-5 font-display text-[15px] font-bold text-white">
                  Описание
                </div>
                <div className="text-[13px] leading-[1.6] text-[#A79C92]">
                  {attrs.description}
                </div>
              </>
            )}

          {/* reviews */}
          <div className="mb-2.5 mt-5 flex items-center">
            <span className="font-display text-[15px] font-bold text-white">
              Отзывы
            </span>
            <span className="ml-auto text-[13px] text-[#E5B23C]">
              {reviews?.count
                ? `★ ${(reviews.avgRating ?? 0).toFixed(1)} · ${reviews.count}`
                : "пока нет"}
            </span>
          </div>
          {(reviews?.items ?? []).slice(0, 4).map((r) => (
            <div
              key={r.id}
              className="mb-2 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5"
            >
              <div className="flex justify-between">
                <span className="text-[13px] font-semibold text-white">
                  {r.customerName}
                </span>
                <span className="text-[12px] text-[#E5B23C]">
                  {stars(r.rating)}
                </span>
              </div>
              {r.text && (
                <div className="mt-1.5 text-[12px] leading-[1.5] text-[#A79C92]">
                  {r.text}
                </div>
              )}
            </div>
          ))}

          {/* similar */}
          {similar.length > 0 && (
            <>
              <div className="mb-2.5 mt-5 font-display text-[15px] font-bold text-white">
                Похожие товары
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1.5">
                {similar.slice(0, 8).map((s) => (
                  <Link
                    key={s.id}
                    href={`/product/${s.id}`}
                    className="w-[120px] flex-shrink-0"
                  >
                    <div className="relative h-[92px] overflow-hidden rounded-[12px] bg-gradient-to-br from-[#2A2620] to-[#16130F]">
                      {productImage(s) ? <Image src={productImage(s)!} alt={s.name} fill sizes="120px" className="object-contain p-2" /> : <span className="grid h-full place-items-center text-[#8A7F76]"><ImageOff size={20} /></span>}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-[11px] leading-[1.3] text-[#D8CFC6]">
                      {s.name}
                    </div>
                    <div className="text-[12px] font-bold text-white">
                      {som(s.price)}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </MobileFrame>
  );
}

function variantOptionLabel(product: CatalogProduct): string {
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
