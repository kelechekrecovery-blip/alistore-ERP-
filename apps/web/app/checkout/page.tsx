'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { som } from '@/lib/format';
import {
  confirmSandboxPayment,
  createCustomer,
  createOrder,
  createPaymentIntent,
  type CreatedOrder,
  type PaymentIntent,
} from '@/lib/api';
import { loadAddresses, mainAddress, type SavedAddress } from '@/lib/account-local';

const DELIVERY = [
  { id: 'pickup', icon: '🏬', name: 'Самовывоз', meta: 'AliStore Центр · сегодня', price: 'бесплатно', fee: 0 },
  { id: 'courier', icon: '🚚', name: 'Курьер', meta: 'по Бишкеку, 1–2 ч', price: '200 с', fee: 200 },
  { id: 'express', icon: '⚡', name: 'Экспресс', meta: 'в течение часа', price: '400 с', fee: 400 },
];
const PAYMENT = [
  { id: 'cash', icon: '💵', name: 'Наличными при получении' },
  { id: 'card', icon: '💳', name: 'Картой' },
  { id: 'qr_mbank', icon: '📱', name: 'QR · MBank' },
  { id: 'qr_odengi', icon: '📲', name: 'QR · O!Деньги' },
  { id: 'installment', icon: '📅', name: 'Рассрочка 0-0-12' },
] as const;
type PaymentChoice = (typeof PAYMENT)[number]['id'];
const STEPS = ['Получение', 'Контакты', 'Оплата', 'Подтверждение'];
type DoneState = { order: CreatedOrder; intent?: PaymentIntent; paid?: boolean };

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, total, promoDiscount, bonusDiscount, promoCode, clear, hydrated } = useCart();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [delivery, setDelivery] = useState('pickup');
  const [payment, setPayment] = useState<PaymentChoice>('cash');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  useEffect(() => { if (user?.phone) setPhone((p) => p || user.phone); }, [user]);
  useEffect(() => { setAddress(mainAddress(loadAddresses())); }, []);
  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());
  const deliveryFee = DELIVERY.find((d) => d.id === delivery)?.fee ?? 0;
  const payable = total + deliveryFee;

  async function place() {
    setBusy(true); setError(null);
    try {
      const customer = await createCustomer({ phone: phone.trim(), name: name.trim() || undefined });
      const order = await createOrder({ customerId: customer.id, channel: 'web', total: payable, items: items.map((i) => ({ sku: i.sku, qty: i.qty, price: i.price })) });
      if (payment === 'cash') {
        setDone({ order });
        clear();
        return;
      }
      const intent = await createPaymentIntent({
        orderId: order.id,
        method: payment,
        amount: payable,
        actor: 'web_checkout',
      });
      setDone({ order: { ...order, status: intent.orderStatus }, intent });
    } catch { setError('Не удалось оформить заказ.'); } finally { setBusy(false); }
  }

  async function confirmPayment() {
    if (!done?.intent) return;
    setBusy(true); setError(null);
    try {
      const res = await confirmSandboxPayment({
        orderId: done.intent.orderId,
        method: done.intent.method,
        amount: done.intent.amount,
        txnId: done.intent.txnId,
      });
      setDone({ ...done, order: { ...done.order, status: res.order?.status ?? 'paid' }, paid: true });
      clear();
    } catch {
      setError('Платёж не подтверждён. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
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
        <div className="mt-5 font-display text-2xl font-extrabold">{done.intent && !done.paid ? 'Ожидаем оплату' : 'Заказ оформлен!'}</div>
        <div className="mt-2.5 text-sm text-[#A79C92]">№ <span className="font-mono text-white">{done.order.id.slice(-8)}</span> · {done.order.status}. Мы свяжемся для подтверждения.</div>
        {done.intent && !done.paid && (
          <div className="mt-5 w-full rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4 text-left">
            <div className="text-[13px] font-semibold text-white">{PAYMENT.find((p) => p.id === done.intent?.method)?.name}</div>
            <div className="mt-1 font-mono text-[11px] break-all text-[#8A7F76]">{done.intent.qrPayload ?? done.intent.paymentUrl}</div>
            <div className="mt-2 text-[12px] text-[#A79C92]">Sandbox intent: {done.intent.intentId} · до {new Date(done.intent.expiresAt).toLocaleTimeString('ru-RU')}</div>
            <button type="button" disabled={busy} onClick={confirmPayment} className="mt-3 w-full rounded-[12px] bg-lime py-3 text-center text-sm font-bold text-lime-ink disabled:opacity-60">
              {busy ? 'Проверяем…' : 'Подтвердить sandbox-платёж'}
            </button>
            {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
          </div>
        )}
        <Link href={`/account/orders/${done.order.id}`} className="mt-6 rounded-[13px] bg-lime px-6 py-3.5 text-sm font-bold text-lime-ink">Отследить заказ</Link>
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
            {delivery !== 'pickup' && (
              <Link href="/account/addresses" className="mb-2.5 block rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
                <div className="flex items-center justify-between text-[13px] font-semibold">
                  <span>Адрес доставки</span>
                  <span className="text-lime">изменить</span>
                </div>
                <div className="mt-1.5 text-[12px] leading-relaxed text-[#A79C92]">{address ? `${address.title}: ${address.text}` : 'Добавьте адрес доставки'}</div>
              </Link>
            )}
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
              {delivery !== 'pickup' && <Row k="Адрес" v={address?.text ?? 'не указан'} />}
              <Row k="Оплата" v={PAYMENT.find((p) => p.id === payment)?.name ?? ''} />
              <Row k="Телефон" v={phone} />
              <Row k="Товаров" v={String(items.reduce((s, i) => s + i.qty, 0))} />
              <div className="my-2 border-t border-[#2E2822]" />
              <Row k="Товары" v={som(subtotal)} />
              {promoDiscount > 0 && <Row k={`Промокод ${promoCode ?? ''}`} v={`−${som(promoDiscount)}`} />}
              {bonusDiscount > 0 && <Row k="Бонусы" v={`−${som(bonusDiscount)}`} />}
              <Row k="Доставка" v={deliveryFee ? som(deliveryFee) : 'бесплатно'} />
              <div className="flex items-center justify-between"><span className="text-[15px] font-bold">К оплате</span><span className="font-display text-lg font-extrabold text-lime">{som(payable)}</span></div>
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
  return (
    <div className="flex gap-3 py-1.5 text-[13px] text-[#A79C92]">
      <span className="flex-shrink-0">{k}</span>
      <span className="ml-auto min-w-0 text-right text-[#D8CFC6]">{v}</span>
    </div>
  );
}
