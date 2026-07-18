"use client";

import Image from "next/image";
import Link from "next/link";
import { GitCompareArrows, ImageOff, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { productImage } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { fetchCatalog, type CatalogProduct } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useCompare } from "@/lib/compare";
import { conditionLabel, som } from "@/lib/format";

function attr(product: CatalogProduct, keys: string[]) {
  const attributes = product.attrs ?? {};
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" || typeof value === "number")
      return String(value);
  }
  return "—";
}

export default function ComparePage() {
  const compare = useCompare();
  const { add } = useCart();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    fetchCatalog({ limit: 100 })
      .then((response) => setProducts(response.items))
      .catch(() => setProducts([]));
  }, []);
  const list = compare.ids
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean) as CatalogProduct[];
  const bestPrice =
    list.length > 1 ? Math.min(...list.map((product) => product.price)) : -1;

  return (
    <div className="min-h-screen bg-paper text-coal [font-family:Manrope,-apple-system,BlinkMacSystemFont,sans-serif]">
      <SiteHeader />
      <main className="mx-auto min-h-[620px] max-w-[1400px] px-5 py-10">
        <div className="text-xs text-slate">Главная / Сравнение</div>
        <h1 className="mt-3 text-[34px] font-extrabold">Сравнение</h1>
        <p className="mt-2 text-steel">
          Сопоставьте цены, состояние, память и наличие.
        </p>
        {compare.hydrated && list.length === 0 ? (
          <div className="mt-10 grid min-h-[330px] place-items-center rounded-[12px] border border-mist bg-white text-center">
            <div>
              <GitCompareArrows className="mx-auto text-slate" size={40} />
              <h2 className="mt-5 text-2xl font-bold">Нечего сравнивать</h2>
              <p className="mt-2 text-steel">
                Добавьте до четырёх товаров из карточки товара.
              </p>
              <Link
                href="/catalog"
                className="mt-6 inline-flex rounded-[9px] bg-coral px-6 py-3 text-sm font-bold text-white"
              >
                Открыть каталог
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-10 overflow-x-auto rounded-[12px] border border-mist bg-white">
            <div
              className="grid min-w-[760px]"
              style={{
                gridTemplateColumns: `180px repeat(${Math.max(list.length, 1)}, minmax(220px, 1fr))`,
              }}
            >
              <div className="border-b border-r border-mist p-5 text-sm text-slate">
                Товар
              </div>
              {list.map((product) => (
                <div
                  key={product.id}
                  className="relative border-b border-r border-mist p-5 last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => compare.remove(product.id)}
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-[8px] border border-mist text-slate hover:text-coral"
                    aria-label="Убрать"
                  >
                    <Trash2 size={15} />
                  </button>
                  <Link
                    href={`/product/${product.id}`}
                    className="relative mx-auto block h-36 w-36"
                  >
                    {productImage(product) ? <Image src={productImage(product)!} alt={product.name} fill sizes="144px" className="object-contain" /> : <span className="flex h-full items-center justify-center text-slate"><ImageOff size={28} /></span>}
                  </Link>
                  <Link
                    href={`/product/${product.id}`}
                    className="mt-3 block min-h-[48px] font-medium leading-6 hover:text-coral"
                  >
                    {product.name}
                  </Link>
                  {product.price === bestPrice && (
                    <span className="mt-2 inline-flex rounded-[4px] bg-[#eaf8f0] px-2 py-1 text-[10px] text-[#00a046]">
                      Лучшая цена
                    </span>
                  )}
                  <div className="mt-3 text-xl font-bold">
                    {som(product.price)}
                  </div>
                  <button
                    type="button"
                    disabled={product.availableUnits < 1}
                    onClick={() =>
                      add({
                        id: product.id,
                        sku: product.sku,
                        name: product.name,
                        price: product.price,
                        stockLimit: product.availableUnits,
                      })
                    }
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-[8px] bg-coal py-2.5 text-sm font-bold text-white hover:bg-coral disabled:bg-mist disabled:text-slate"
                  >
                    <ShoppingBag size={16} /> В корзину
                  </button>
                </div>
              ))}
              <CompareRow
                label="Состояние"
                products={list}
                value={(product) => conditionLabel(product.attrs)}
              />
              <CompareRow
                label="Бренд"
                products={list}
                value={(product) =>
                  attr(product, ["brand", "Бренд", "производитель"])
                }
              />
              <CompareRow
                label="Память"
                products={list}
                value={(product) =>
                  attr(product, ["memory", "storage", "Память", "объём"])
                }
              />
              <CompareRow
                label="Гарантия"
                products={list}
                value={(product) => typeof product.attrs?.warranty === "string" ? product.attrs.warranty : "Не указана"}
              />
              <CompareRow
                label="Наличие"
                products={list}
                value={(product) =>
                  product.availableUnits > 0
                    ? `${product.availableUnits} шт.`
                    : "Под заказ"
                }
              />
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function CompareRow({
  label,
  products,
  value,
}: {
  label: string;
  products: CatalogProduct[];
  value: (product: CatalogProduct) => string;
}) {
  return (
    <>
      <div className="border-b border-r border-mist p-5 text-sm text-slate">
        {label}
      </div>
      {products.map((product) => (
        <div
          key={`${label}-${product.id}`}
          className="border-b border-r border-mist p-5 text-sm text-steel last:border-r-0"
        >
          {value(product)}
        </div>
      ))}
    </>
  );
}
