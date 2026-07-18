"use client";

import Link from "next/link";
import { useState } from "react";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { som } from "@/lib/format";
import { useCart } from "@/lib/cart";

export default function MobileCart() {
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
  } = useCart();
  const [promoInput, setPromoInput] = useState("");

  const count = items.reduce((s, i) => s + i.qty, 0);
  const discount = promoDiscount + bonusDiscount;
  const empty = hydrated && items.length === 0;

  async function submitPromo() {
    if (promoCode) {
      clearPromo();
      setPromoInput("");
      return;
    }
    await applyPromo(promoInput);
  }

  return (
    <MobileFrame active="cart">
      <div className="px-4 pb-6 pt-1">
        <div className="mb-3.5 font-display text-[20px] font-bold text-white">
          Корзина
        </div>

        {empty ? (
          <div className="py-12 text-center">
            <div className="text-5xl">🛒</div>
            <div className="mt-3.5 font-display text-[17px] font-bold text-white">
              Корзина пуста
            </div>
            <div className="mt-2 text-[13px] text-muted">
              Добавьте товары из каталога
            </div>
            <Link
              href="/catalog"
              className="mt-4 inline-block rounded-[11px] bg-lime px-[22px] py-3 text-[13px] font-bold text-lime-ink"
            >
              В каталог
            </Link>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <div
                key={item.id}
                className="mb-2.5 flex gap-3 rounded-[14px] border border-surface-3 bg-surface-2 p-3"
              >
                <Link
                  href={`/product/${item.id}`}
                  className="relative h-[70px] w-[70px] flex-shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2A2620] to-ink-dark"
                >
                  <span className="grid h-full place-items-center text-xl font-bold text-subtle">{item.name.slice(0, 1)}</span>
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${item.id}`}
                    className="block text-[13px] font-semibold text-white"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-1 font-display text-[15px] font-extrabold text-white">
                    {som(item.price * item.qty)}
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="flex items-center gap-3 rounded-[8px] bg-surface-3 px-2.5 py-[5px]">
                      <button
                        type="button"
                        onClick={() => setQty(item.id, item.qty - 1)}
                        className="text-base text-white"
                        aria-label="Уменьшить"
                      >
                        −
                      </button>
                      <span className="font-mono text-[13px] text-white">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        disabled={item.qty >= item.stockLimit}
                        onClick={() => setQty(item.id, item.qty + 1)}
                        className="text-base text-white disabled:opacity-30"
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="text-[12px] text-subtle"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {items.length > 0 && (
              <>
                {/* promo */}
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Промокод"
                    className="min-w-0 flex-1 rounded-[11px] border border-surface-3 bg-surface-2 px-3 py-3 text-[13px] uppercase text-white outline-none placeholder:normal-case placeholder:text-faint focus:border-lime"
                  />
                  <button
                    type="button"
                    onClick={submitPromo}
                    disabled={promoLoading}
                    className="rounded-[11px] bg-surface-3 px-[18px] text-[13px] font-semibold text-lime"
                  >
                    {promoCode ? "Убрать" : promoLoading ? "Проверяем…" : "Применить"}
                  </button>
                </div>
                {promoError && (
                  <div className="mt-1.5 text-[11px] text-coral">
                    {promoError}
                  </div>
                )}
                {promoCode && (
                  <div className="mt-1.5 text-[11px] text-lime">
                    {promoCode} · −{som(promoDiscount)}
                  </div>
                )}

                {/* bonus */}
                <button
                  type="button"
                  onClick={toggleBonus}
                  disabled={bonusLoading || bonusBalance <= 0}
                  className="mt-2 flex w-full items-center gap-2.5 rounded-[11px] border border-surface-3 bg-surface-2 p-3 text-left"
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-[6px] border-2 text-[12px] ${
                      bonusApplied
                        ? "border-lime bg-lime text-lime-ink"
                        : "border-line"
                    }`}
                  >
                    {bonusApplied ? "✓" : ""}
                  </span>
                  <span className="text-[13px] text-bright">
                    {bonusLoading
                      ? "Проверяем бонусы…"
                      : `Списать до ${bonusBalance.toLocaleString("ru-RU")}`}
                  </span>
                  <span className="ml-auto text-[12px] text-lime">
                    {bonusApplied
                      ? `−${som(bonusDiscount)}`
                      : bonusBalance > 0
                        ? "доступно"
                        : "войдите"}
                  </span>
                </button>
                {bonusError && (
                  <div className="mt-1.5 text-[11px] text-coral">
                    {bonusError}
                  </div>
                )}

                {/* totals */}
                <div className="mt-3 rounded-[14px] border border-surface-3 bg-surface-2 p-4">
                  <div className="flex justify-between py-1 text-[13px] text-muted">
                    Товары ({count}){" "}
                    <span className="text-bright">{som(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between py-1 text-[13px] text-lime">
                      Скидка <span>−{som(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 text-[13px] text-muted">
                    Доставка{" "}
                    <span className="text-bright">рассчитаем далее</span>
                  </div>
                  <div className="my-2 border-t border-surface-3" />
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[16px] font-bold text-white">
                      Итого
                    </span>
                    <span className="font-display text-[20px] font-extrabold text-lime">
                      {som(total)}
                    </span>
                  </div>
                </div>
                <Link
                  href="/checkout"
                  className="mt-3 block rounded-[13px] bg-lime py-[15px] text-center text-[15px] font-bold text-lime-ink"
                >
                  Оформить заказ
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </MobileFrame>
  );
}
