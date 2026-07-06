'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { som } from '@/lib/format';
import { createCustomer, createOrder, type CreatedOrder } from '@/lib/api';

const DELIVERY = [
  { id: 'pickup', icon: '🏬', name: 'Самовывоз', meta: 'AliStore Центр · сегодня', price: 'бесплатно' },
  { id: 'courier', icon: '🚚', name: 'Курьер', meta: 'по Бишкеку, 1–2 ч', price: '200 с' },
  { id: 'express', icon: '⚡', name: 'Экспресс', meta: 'в течение часа', price: '400 с' },
];
const PAYMENT = [
  { id: 'cash', icon: '💵', name: 'Наличными при получении' },
  { id: 'card', icon: '💳', name: 'Картой' },
  { id: 'qr', icon: '📱', name: 'QR · MBank / O!Деньги' },
  { id: 'installment', icon: '📅', name: 'Рассрочка 0-0-12' },
];
const STEPS = ['Получение', 'Контакты', 'Оплата', 'Подтверждение'];

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clear, hydrated } = useCart();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [delivery, setDelivery] = useState('pickup');
  const [payment, setPayment] = useState('cash');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatedOrder | null>(null);

  useEffect(() => { if (user?.phone) setPhone((p) => p || user.phone); }, [user]);
  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());

  async function place() {
    setBusy(true); setError(null);
    try {
      const customer = await createCustomer({ phone: phone.trim(), name: name.trim() || undefined });
      const order = await createOrder({ customerId: customer.id, channel: 'web', total: subtotal, items: items.map((i) => ({ sku: i.sku, qty: i.qty, price: i.price })) });
      setDone(order); clear();
    } catch { setError('Не удалось оформить заказ.'); } finally { setBusy(false); }
  }

  const wrap = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-40 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">{children}</div>
    </div>
  );

  if (done) {
    return wrap(
      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-lime/15 text-4xl">✓</div>
        <div className="mt-5 font-display text-2xl font-extrabold">Заказ оформлен!</div>
        <div className="mt-2.5 text-sm text-[#A79C92]">№ <span className="font-mono text-white">{done.id.slice(-8)}</span> · {done.status}. Мы свяжемся для подтверждения.</div>
        <Link href={`/account/orders/${done.id}`} className="mt-6 rounded-[13px] bg-lime px-6 py-3.5 text-sm font-bold text-lime-ink">Отследить заказ</Link>
        <Link href="/" className="mt-4 text-sm text-[#A79C92]">На главную</Link>
      </div>,
    );
  }
  if (hydrated && items.length === 0) {
    return wrap(<div className="flex flex-1 flex-col items-center justify-center text-center"><p className="font-display text-lg font-bold">Корзина пуста</p><Link href="/" className="mt-3 text-sm text-lime">В каталог →</Link></div>);
  }

  return wrap(
    <>
      <div className="flex items-center gap-3 px-4 pb-3 pt-5">
        <button type="button" onClick={() => (step > 0 ? setStep(step - 1) : router.back())} className="text-xl">←</button>
        <span className="font-display text-xl font-bold">Оформление</span>
      </div>
      <div className="flex gap-1.5 px-4 pb-4">
        {STEPS.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-chip ${i <= step ? 'bg-lime' : 'bg-[#2E2822]'}`} />)}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 0 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Способ получения</div>
            {DELIVERY.map((d) => (
              <button key={d.id} type="button" onClick={() => setDelivery(d.id)} className={`mb-2.5 flex w-full items-center gap-3 rounded-[13px] border bg-[#221E19] p-3.5 text-left ${delivery === d.id ? 'border-lime' : 'border-[#2E2822]'}`}>
                <span className="text-2xl">{d.icon}</span>
                <div className="flex-1"><div className="text-sm font-semibold">{d.name}</div><div className="text-xs text-[#A79C92]">{d.meta}</div></div>
                <span className="text-[13px] text-[#D8CFC6]">{d.price}</span>
              </button>
            ))}
            <button type="button" onClick={() => setStep(1)} className="mt-2 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink">Далее</button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Контакты</div>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996 700 12 34 56" className="mb-2.5 w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5 font-mono text-sm text-white outline-none focus:border-lime" />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" className="mb-2.5 w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5 text-sm text-white outline-none focus:border-lime" />
            {error && <p className="text-sm text-[#FF8A7A]">{error}</p>}
            <button type="button" disabled={!phoneValid} onClick={() => setStep(2)} className="mt-2 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">Далее</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Оплата</div>
            {PAYMENT.map((p) => (
              <button key={p.id} type="button" onClick={() => setPayment(p.id)} className={`mb-2.5 flex w-full items-center gap-3 rounded-[13px] border bg-[#221E19] p-3.5 text-left ${payment === p.id ? 'border-lime' : 'border-[#2E2822]'}`}>
                <span className="text-xl">{p.icon}</span>
                <span className="flex-1 text-sm">{p.name}</span>
                <span className={`h-4.5 w-4.5 rounded-full border-2 ${payment === p.id ? 'border-lime' : 'border-[#3A342E]'}`} style={{ height: 18, width: 18 }} />
              </button>
            ))}
            <button type="button" onClick={() => setStep(3)} className="mt-2 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink">К подтверждению</button>
          </>
        )}
        {step === 3 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Подтверждение</div>
            <div className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
              <Row k="Получение" v={DELIVERY.find((d) => d.id === delivery)?.name ?? ''} />
              <Row k="Оплата" v={PAYMENT.find((p) => p.id === payment)?.name ?? ''} />
              <Row k="Телефон" v={phone} />
              <Row k="Товаров" v={String(items.reduce((s, i) => s + i.qty, 0))} />
              <div className="my-2 border-t border-[#2E2822]" />
              <div className="flex items-center justify-between"><span className="text-[15px] font-bold">К оплате</span><span className="font-display text-lg font-extrabold text-lime">{som(subtotal)}</span></div>
            </div>
            {error && <p className="mt-3 text-sm text-[#FF8A7A]">{error}</p>}
            <button type="button" disabled={busy} onClick={place} className="mt-3 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:opacity-60">{busy ? 'Оформляем…' : 'Подтвердить заказ'}</button>
          </>
        )}
      </div>
    </>,
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1.5 text-[13px] text-[#A79C92]">{k} <span className="text-[#D8CFC6]">{v}</span></div>;
}
