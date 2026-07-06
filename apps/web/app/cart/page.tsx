'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';
import { MobileTabBar } from '@/components/MobileTabBar';

export default function CartPage() {
  const { items, subtotal, setQty, remove, hydrated } = useCart();
  const [bonus, setBonus] = useState(false);
  const discount = bonus ? Math.min(subtotal, 4820) : 0;
  const total = subtotal - discount;

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-5">
          <h1 className="mb-3.5 font-display text-xl font-bold">Корзина</h1>

          {hydrated && items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-5xl">🛒</div>
              <div className="mt-3.5 font-display text-[17px] font-bold">Корзина пуста</div>
              <div className="mt-2 text-[13px] text-[#A79C92]">Добавьте товары из каталога</div>
              <Link href="/" className="mt-4 inline-block rounded-[11px] bg-lime px-5 py-3 text-[13px] font-bold text-lime-ink">В каталог</Link>
            </div>
          ) : (
            <>
              {items.map((i) => (
                <div key={i.id} className="mb-2.5 flex gap-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3">
                  <Link href={`/product/${i.id}`} className="grid h-[70px] w-[70px] flex-shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F] font-display text-2xl font-extrabold text-white/15">{i.name.slice(0, 1)}</Link>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{i.name}</div>
                    <div className="mt-1 font-display text-[15px] font-extrabold">{som(i.price * i.qty)}</div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="flex items-center gap-3 rounded-[8px] bg-[#2E2822] px-2.5 py-1">
                        <button type="button" onClick={() => setQty(i.id, i.qty - 1)} className="text-base">−</button>
                        <span className="font-mono text-[13px]">{i.qty}</span>
                        <button type="button" onClick={() => setQty(i.id, i.qty + 1)} className="text-base">+</button>
                      </div>
                      <button type="button" onClick={() => remove(i.id)} className="text-xs text-[#8A7F76]">Удалить</button>
                    </div>
                  </div>
                </div>
              ))}

              {items.length > 0 && (
                <>
                  <div className="mt-1.5 flex gap-2">
                    <div className="flex-1 rounded-[11px] border border-[#2E2822] bg-[#221E19] p-3 text-[13px] text-[#6E645C]">Промокод</div>
                    <button type="button" className="rounded-[11px] bg-[#2E2822] px-4.5 py-3 text-[13px] font-semibold text-[#8A7F76]" style={{ padding: '12px 18px' }}>Применить</button>
                  </div>
                  <button type="button" onClick={() => setBonus((b) => !b)} className="mt-2 flex w-full items-center gap-2.5 rounded-[11px] border border-[#2E2822] bg-[#221E19] p-3">
                    <span className={`grid h-5 w-5 place-items-center rounded-[6px] border-2 text-xs ${bonus ? 'border-lime bg-lime text-lime-ink' : 'border-[#3A342E]'}`}>{bonus ? '✓' : ''}</span>
                    <span className="text-[13px] text-[#D8CFC6]">Списать 4 820 бонусов</span>
                  </button>

                  <div className="mt-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
                    <div className="flex justify-between py-1 text-[13px] text-[#A79C92]">Товары <span className="text-[#D8CFC6]">{som(subtotal)}</span></div>
                    {discount > 0 && <div className="flex justify-between py-1 text-[13px] text-lime">Бонусы <span>−{som(discount)}</span></div>}
                    <div className="flex justify-between py-1 text-[13px] text-[#A79C92]">Доставка <span className="text-[#D8CFC6]">бесплатно</span></div>
                    <div className="my-2 border-t border-[#2E2822]" />
                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-bold">Итого</span>
                      <span className="font-display text-xl font-extrabold text-lime">{som(total)}</span>
                    </div>
                  </div>
                  <Link href="/checkout" className="mt-3 block rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink">Оформить заказ</Link>
                </>
              )}
            </>
          )}
        </div>
        <MobileTabBar active="cart" />
      </div>
    </div>
  );
}
