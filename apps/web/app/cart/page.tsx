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
    <div className="md:hidden"><MobileCart /></div>
    <div className="hidden min-h-screen bg-sand text-ink md:block">
    <SiteHeader />
    <main className="mx-auto w-[min(1200px,92vw)] py-10 sm:py-14">
      <div className="text-xs text-[#8A7F76]">Главная / Корзина</div>
      <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Корзина</h1>
      <p className="mt-3 text-[#6E645C]">Проверьте товары, примените промокод и переходите к оформлению.</p>

      {hydrated && items.length === 0 ? <div className="mt-12 grid min-h-[360px] place-items-center rounded-[22px] border border-[#E7DDD3] bg-white px-6 text-center shadow-soft"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-tint text-deep"><ShoppingBag size={30} /></span><h2 className="mt-5 font-display text-2xl font-bold">Корзина пуста</h2><p className="mt-2 text-[#6E645C]">Добавьте технику из каталога AliStore.</p><Link href="/catalog" className="mt-6 inline-flex rounded-[12px] bg-coral px-6 py-3 text-sm font-bold text-white">Перейти в каталог</Link></div></div> : <div className="mt-10 grid gap-7 lg:grid-cols-[1fr_380px]">
        <section className="grid content-start gap-3">
          {items.map((item) => <article key={item.id} className="grid grid-cols-[86px_1fr] gap-4 rounded-[18px] border border-[#E7DDD3] bg-white p-4 shadow-soft sm:grid-cols-[110px_1fr_auto] sm:items-center">
            <Link href={`/product/${item.id}`} className="grid aspect-square place-items-center rounded-[14px] bg-gradient-to-br from-white to-[#F2ECE5] font-display text-3xl font-bold text-coral/20">{item.name.slice(0,1)}</Link>
            <div className="min-w-0"><Link href={`/product/${item.id}`} className="font-medium leading-6 text-ink hover:text-deep">{item.name}</Link><div className="mt-1 font-mono text-xs text-[#8A7F76]">{item.sku}</div><div className="mt-4 flex items-center gap-3"><div className="flex items-center rounded-[11px] border border-[#DED3C8] bg-white p-1"><button type="button" onClick={() => setQty(item.id, item.qty - 1)} className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-sand" aria-label="Уменьшить"><Minus size={14} /></button><span className="min-w-8 text-center text-sm">{item.qty}</span><button type="button" onClick={() => setQty(item.id, item.qty + 1)} className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-sand" aria-label="Увеличить"><Plus size={14} /></button></div><button type="button" onClick={() => remove(item.id)} className="flex items-center gap-1.5 text-xs text-[#8A7F76] hover:text-danger"><Trash2 size={14} /> Удалить</button></div></div>
            <div className="col-span-2 text-right sm:col-span-1"><div className="font-display text-xl font-bold">{som(item.price * item.qty)}</div><div className="mt-1 text-xs text-[#6c7080]">{som(item.price)} / шт.</div></div>
          </article>)}

          {items.length > 0 && <div className="mt-2 rounded-[18px] border border-[#E7DDD3] bg-white p-5 shadow-soft"><h2 className="font-display font-semibold">Промокод и бонусы</h2><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={promoInput} onChange={(event) => setPromoInput(event.target.value)} placeholder="Введите промокод" className="min-w-0 flex-1 rounded-[11px] border border-[#DED3C8] bg-white px-4 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-[#A79C92] focus:border-coral" /><button type="button" onClick={submitPromo} className="rounded-[11px] border border-[#DED3C8] bg-sand px-5 py-3 text-sm font-semibold hover:border-coral">{promoCode ? 'Убрать' : 'Применить'}</button></div>{promoError && <p className="mt-2 text-xs text-danger">{promoError}</p>}{promoCode && <p className="mt-2 text-xs text-success">{promoCode} применён · скидка {som(promoDiscount)}</p>}<button type="button" onClick={toggleBonus} className="mt-4 flex w-full items-center gap-3 rounded-[12px] border border-[#DED3C8] bg-sand p-4 text-left"><span className={`grid h-5 w-5 place-items-center rounded-[5px] border text-xs ${bonusApplied ? 'border-coral bg-coral text-white' : 'border-[#A79C92]'}`}>{bonusApplied ? '✓' : ''}</span><span className="text-sm text-ink">Списать до 4 820 бонусов</span><span className="ml-auto text-xs text-deep">{bonusApplied ? `−${som(bonusDiscount)}` : 'доступно'}</span></button></div>}
        </section>

        {items.length > 0 && <aside className="h-fit rounded-[20px] border border-[#E7DDD3] bg-white p-6 shadow-soft lg:sticky lg:top-24"><h2 className="font-display text-xl font-bold">Ваш заказ</h2><div className="mt-5 grid gap-3 text-sm text-[#6E645C]"><SummaryRow label={`Товары (${items.reduce((sum,item) => sum + item.qty, 0)})`} value={som(subtotal)} />{promoDiscount > 0 && <SummaryRow label="Промокод" value={`−${som(promoDiscount)}`} accent />}{bonusDiscount > 0 && <SummaryRow label="Бонусы" value={`−${som(bonusDiscount)}`} accent />}<SummaryRow label="Доставка" value="Рассчитаем далее" /></div><div className="my-5 h-px bg-[#E7DDD3]" /><div className="flex items-end justify-between"><span className="font-semibold">Итого</span><span className="font-display text-3xl font-extrabold">{som(total)}</span></div><Link href="/checkout" className="mt-6 flex w-full items-center justify-center rounded-[12px] bg-coral py-3.5 text-sm font-bold text-white hover:bg-deep">Перейти к оформлению</Link><div className="mt-5 flex items-start gap-3 text-xs leading-5 text-[#8A7F76]"><ShieldCheck className="mt-0.5 shrink-0 text-success" size={16} />Безопасная оплата. Товар резервируется после подтверждения заказа.</div></aside>}
      </div>}
    </main>
    <SiteFooter />
    </div>
  </>;
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className="flex justify-between gap-4"><span>{label}</span><span className={accent ? 'text-success' : 'text-ink'}>{value}</span></div>; }
