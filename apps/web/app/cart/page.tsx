'use client';

import Link from 'next/link';
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import MobileCart from '@/components/mobile/MobileCart';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';

export default function CartPage() {
  const { items, subtotal, total, promoCode, promoDiscount, bonusApplied, bonusDiscount, setQty, remove, hydrated, applyPromo, clearPromo, toggleBonus } = useCart();
  const [promoInput, setPromoInput] = useState(promoCode ?? '');
  const [promoError, setPromoError] = useState<string | null>(null);

  function submitPromo() {
    if (promoCode) { clearPromo(); setPromoInput(''); setPromoError(null); return; }
    setPromoError(applyPromo(promoInput) ? null : 'Промокод не найден. Для проверки: SALE5000 или ALI10');
  }

  return <>
    <div className="lg:hidden"><MobileCart /></div>
    <div className="hidden min-h-screen bg-[#0c0c17] text-[#f6f7fb] lg:block">
    <SiteHeader />
    <main className="mx-auto w-[min(1200px,92vw)] py-10 sm:py-14">
      <div className="text-xs text-[#6c7080]">Главная / Корзина</div>
      <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Корзина</h1>
      <p className="mt-3 text-[#a2a6b6]">Проверьте товары, примените промокод и переходите к оформлению.</p>

      {hydrated && items.length === 0 ? <div className="mt-12 grid min-h-[360px] place-items-center rounded-[22px] border border-white/[0.09] bg-white/[0.035] px-6 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-[#f97316]/12 text-[#fb9a4b]"><ShoppingBag size={30} /></span><h2 className="mt-5 font-display text-2xl font-bold">Корзина пуста</h2><p className="mt-2 text-[#a2a6b6]">Добавьте технику из каталога AliStore.</p><Link href="/catalog" className="mt-6 inline-flex rounded-full bg-[#f97316] px-6 py-3 text-sm font-bold text-[#180f02]">Перейти в каталог</Link></div></div> : <div className="mt-10 grid gap-7 lg:grid-cols-[1fr_380px]">
        <section className="grid content-start gap-3">
          {items.map((item) => <article key={item.id} className="grid grid-cols-[86px_1fr] gap-4 rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-4 sm:grid-cols-[110px_1fr_auto] sm:items-center">
            <Link href={`/product/${item.id}`} className="grid aspect-square place-items-center rounded-[14px] bg-[radial-gradient(circle_at_50%_20%,rgba(249,115,22,.14),transparent_50%),linear-gradient(150deg,#191932,#101021)] font-display text-3xl font-bold text-white/20">{item.name.slice(0,1)}</Link>
            <div className="min-w-0"><Link href={`/product/${item.id}`} className="font-medium leading-6 text-white hover:text-[#fb9a4b]">{item.name}</Link><div className="mt-1 text-xs text-[#6c7080]">{item.sku}</div><div className="mt-4 flex items-center gap-3"><div className="flex items-center rounded-full border border-white/[0.1] bg-white/[0.04] p-1"><button type="button" onClick={() => setQty(item.id, item.qty - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/[0.07]" aria-label="Уменьшить"><Minus size={14} /></button><span className="min-w-8 text-center text-sm">{item.qty}</span><button type="button" onClick={() => setQty(item.id, item.qty + 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/[0.07]" aria-label="Увеличить"><Plus size={14} /></button></div><button type="button" onClick={() => remove(item.id)} className="flex items-center gap-1.5 text-xs text-[#6c7080] hover:text-[#ff9a9a]"><Trash2 size={14} /> Удалить</button></div></div>
            <div className="col-span-2 text-right sm:col-span-1"><div className="font-display text-xl font-bold">{som(item.price * item.qty)}</div><div className="mt-1 text-xs text-[#6c7080]">{som(item.price)} / шт.</div></div>
          </article>)}

          {items.length > 0 && <div className="mt-2 rounded-[18px] border border-white/[0.09] bg-white/[0.035] p-5"><h2 className="font-display font-semibold">Промокод и бонусы</h2><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={promoInput} onChange={(event) => setPromoInput(event.target.value)} placeholder="Введите промокод" className="min-w-0 flex-1 rounded-[11px] border border-white/[0.1] bg-[#111120] px-4 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-[#5f6372] focus:border-[#f97316]" /><button type="button" onClick={submitPromo} className="rounded-[11px] border border-white/[0.12] bg-white/[0.055] px-5 py-3 text-sm font-semibold hover:border-[#f97316]">{promoCode ? 'Убрать' : 'Применить'}</button></div>{promoError && <p className="mt-2 text-xs text-[#ff9a9a]">{promoError}</p>}{promoCode && <p className="mt-2 text-xs text-[#7ee2a0]">{promoCode} применён · скидка {som(promoDiscount)}</p>}<button type="button" onClick={toggleBonus} className="mt-4 flex w-full items-center gap-3 rounded-[12px] border border-white/[0.09] bg-[#111120] p-4 text-left"><span className={`grid h-5 w-5 place-items-center rounded-[5px] border text-xs ${bonusApplied ? 'border-[#f97316] bg-[#f97316] text-[#180f02]' : 'border-white/20'}`}>{bonusApplied ? '✓' : ''}</span><span className="text-sm text-[#d7d9e2]">Списать до 4 820 бонусов</span><span className="ml-auto text-xs text-[#fb9a4b]">{bonusApplied ? `−${som(bonusDiscount)}` : 'доступно'}</span></button></div>}
        </section>

        {items.length > 0 && <aside className="h-fit rounded-[20px] border border-white/[0.11] bg-white/[0.055] p-6 lg:sticky lg:top-24"><h2 className="font-display text-xl font-bold">Ваш заказ</h2><div className="mt-5 grid gap-3 text-sm text-[#a2a6b6]"><SummaryRow label={`Товары (${items.reduce((sum,item) => sum + item.qty, 0)})`} value={som(subtotal)} />{promoDiscount > 0 && <SummaryRow label="Промокод" value={`−${som(promoDiscount)}`} accent />}{bonusDiscount > 0 && <SummaryRow label="Бонусы" value={`−${som(bonusDiscount)}`} accent />}<SummaryRow label="Доставка" value="Рассчитаем далее" /></div><div className="my-5 h-px bg-white/[0.09]" /><div className="flex items-end justify-between"><span className="font-semibold">Итого</span><span className="font-display text-3xl font-bold">{som(total)}</span></div><Link href="/checkout" className="mt-6 flex w-full items-center justify-center rounded-full bg-gradient-to-br from-[#f97316] to-[#ea580c] py-3.5 text-sm font-bold text-[#180f02]">Перейти к оформлению</Link><div className="mt-5 flex items-start gap-3 text-xs leading-5 text-[#777b8c]"><ShieldCheck className="mt-0.5 shrink-0 text-[#7ee2a0]" size={16} />Безопасная оплата. Товар резервируется после подтверждения заказа.</div></aside>}
      </div>}
    </main>
    <SiteFooter />
    </div>
  </>;
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className="flex justify-between gap-4"><span>{label}</span><span className={accent ? 'text-[#7ee2a0]' : 'text-[#d7d9e2]'}>{value}</span></div>; }
