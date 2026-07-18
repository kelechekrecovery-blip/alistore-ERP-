"use client";

import Link from "next/link";
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import MobileCart from "@/components/mobile/MobileCart";
import { useCart } from "@/lib/cart";
import { som } from "@/lib/format";
import { fetchProduct } from "@/lib/api";

export default function CartPage() {
  const {
    items,
    subtotal,
    total,
    promoCode,
    promoDiscount,
    promoLoading,
    promoError,
    bonusApplied,
    bonusBalance,
    bonusLoading,
    bonusError,
    bonusDiscount,
    setQty,
    remove,
    hydrated,
    applyPromo,
    clearPromo,
    toggleBonus,
    reconcileAvailability,
  } = useCart();
  const [promoInput, setPromoInput] = useState(promoCode ?? "");

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    let active = true;
    Promise.all(items.map((item) => fetchProduct(item.id))).then((products) => {
      if (active) reconcileAvailability(products.filter((product): product is NonNullable<typeof product> => Boolean(product)));
    });
    return () => { active = false; };
    // The cart context clamps later quantity changes after this authoritative refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, reconcileAvailability]);

  async function submitPromo() {
    if (promoCode) {
      clearPromo();
      setPromoInput("");
      return;
    }
    await applyPromo(promoInput);
  }

  return (
    <>
      <div className="md:hidden">
        <MobileCart />
      </div>
      <div className="hidden min-h-screen bg-paper text-coal [font-family:Manrope,-apple-system,BlinkMacSystemFont,sans-serif] md:block">
        <SiteHeader />
        <main className="mx-auto max-w-[1400px] px-5 py-10">
          <div className="text-xs text-slate">Главная / Корзина</div>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">
            Корзина
          </h1>
          <p className="mt-3 text-steel">
            Проверьте товары, примените промокод и переходите к оформлению.
          </p>

          {hydrated && items.length === 0 ? (
            <div className="mt-12 grid min-h-[360px] place-items-center rounded-[12px] border border-mist bg-white px-6 text-center">
              <div>
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-[12px] bg-tint text-coral">
                  <ShoppingBag size={30} />
                </span>
                <h2 className="mt-5 text-2xl font-bold">Корзина пуста</h2>
                <p className="mt-2 text-steel">
                  Добавьте технику из каталога AliStore.
                </p>
                <Link
                  href="/catalog"
                  className="mt-6 inline-flex rounded-[9px] bg-coral px-6 py-3 text-sm font-bold text-white"
                >
                  Перейти в каталог
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-10 grid gap-7 lg:grid-cols-[1fr_380px]">
              <section className="grid content-start gap-3">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="grid grid-cols-[86px_1fr] gap-4 rounded-[12px] border border-mist bg-white p-4 sm:grid-cols-[110px_1fr_auto] sm:items-center"
                  >
                    <Link
                      href={`/product/${item.id}`}
                      className="grid aspect-square place-items-center rounded-[8px] bg-paper text-3xl font-bold text-coral/20"
                    >
                      {item.name.slice(0, 1)}
                    </Link>
                    <div className="min-w-0">
                      <Link
                        href={`/product/${item.id}`}
                        className="font-medium leading-6 text-coal hover:text-coral"
                      >
                        {item.name}
                      </Link>
                      <div className="mt-1 font-mono text-xs text-slate">
                        {item.sku}
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="flex items-center rounded-[9px] border border-haze bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setQty(item.id, item.qty - 1)}
                            className="grid h-8 w-8 place-items-center rounded-[7px] hover:bg-paper"
                            aria-label="Уменьшить"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="min-w-8 text-center text-sm">
                            {item.qty}
                          </span>
                        <button
                          type="button"
                          disabled={item.qty >= item.stockLimit}
                          onClick={() => setQty(item.id, item.qty + 1)}
                          className="grid h-8 w-8 place-items-center rounded-[7px] hover:bg-paper disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Увеличить"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          className="flex items-center gap-1.5 text-xs text-slate hover:text-coral"
                        >
                          <Trash2 size={14} /> Удалить
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2 text-right sm:col-span-1">
                      <div className="font-display text-xl font-bold">
                        {som(item.price * item.qty)}
                      </div>
                      <div className="mt-1 text-xs text-[#6c7080]">
                        {som(item.price)} / шт.
                      </div>
                    </div>
                  </article>
                ))}

                {items.length > 0 && (
                  <div className="mt-2 rounded-[12px] border border-mist bg-white p-5">
                    <h2 className="font-semibold">Промокод и бонусы</h2>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={promoInput}
                        onChange={(event) => setPromoInput(event.target.value)}
                        placeholder="Введите промокод"
                        className="min-w-0 flex-1 rounded-[9px] border border-haze bg-white px-4 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-slate focus:border-coal"
                      />
                      <button
                        type="button"
                        onClick={submitPromo}
                        className="rounded-[9px] border border-haze bg-paper px-5 py-3 text-sm font-semibold hover:border-coral"
                      >
                        {promoCode ? "Убрать" : promoLoading ? "Проверяем…" : "Применить"}
                      </button>
                    </div>
                    {promoError && (
                      <p className="mt-2 text-xs text-danger">{promoError}</p>
                    )}
                    {promoCode && (
                      <p className="mt-2 text-xs text-success">
                        {promoCode} применён · скидка {som(promoDiscount)}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={toggleBonus}
                      disabled={bonusLoading || bonusBalance <= 0}
                      className="mt-4 flex w-full items-center gap-3 rounded-[9px] border border-haze bg-paper p-4 text-left disabled:opacity-60"
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-[5px] border text-xs ${bonusApplied ? "border-coral bg-coral text-white" : "border-slate"}`}
                      >
                        {bonusApplied ? "✓" : ""}
                      </span>
                      <span className="text-sm text-coal">
                        {bonusLoading
                          ? "Проверяем бонусы…"
                          : `Списать до ${bonusBalance.toLocaleString("ru-RU")} бонусов`}
                      </span>
                      <span className="ml-auto text-xs text-coral">
                        {bonusApplied
                          ? `−${som(bonusDiscount)}`
                          : bonusBalance > 0
                            ? "доступно"
                            : "войдите в аккаунт"}
                      </span>
                    </button>
                    {bonusError && (
                      <p className="mt-2 text-xs text-danger">{bonusError}</p>
                    )}
                  </div>
                )}
              </section>

              {items.length > 0 && (
                <aside className="h-fit rounded-[12px] border border-mist bg-white p-6 lg:sticky lg:top-24">
                  <h2 className="text-xl font-bold">Ваш заказ</h2>
                  <div className="mt-5 grid gap-3 text-sm text-steel">
                    <SummaryRow
                      label={`Товары (${items.reduce((sum, item) => sum + item.qty, 0)})`}
                      value={som(subtotal)}
                    />
                    {promoDiscount > 0 && (
                      <SummaryRow
                        label="Промокод"
                        value={`−${som(promoDiscount)}`}
                        accent
                      />
                    )}
                    {bonusDiscount > 0 && (
                      <SummaryRow
                        label="Бонусы"
                        value={`−${som(bonusDiscount)}`}
                        accent
                      />
                    )}
                    <SummaryRow label="Доставка" value="Рассчитаем далее" />
                  </div>
                  <div className="my-5 h-px bg-mist" />
                  <div className="flex items-end justify-between">
                    <span className="font-semibold">Итого</span>
                    <span className="text-3xl font-extrabold">
                      {som(total)}
                    </span>
                  </div>
                  <Link
                    href="/checkout"
                    className="mt-6 flex w-full items-center justify-center rounded-[9px] bg-coral py-3.5 text-sm font-bold text-white hover:bg-[#e63a1c]"
                  >
                    Перейти к оформлению
                  </Link>
                  <div className="mt-5 flex items-start gap-3 text-xs leading-5 text-slate">
                    <ShieldCheck
                      className="mt-0.5 shrink-0 text-[#00a046]"
                      size={16}
                    />
                    Безопасная оплата. Товар резервируется после подтверждения
                    заказа.
                  </div>
                </aside>
              )}
            </div>
          )}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}

function SummaryRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className={accent ? "text-success" : "text-ink"}>{value}</span>
    </div>
  );
}
