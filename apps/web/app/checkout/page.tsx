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
  createMyOrder,
  createMyPaymentIntent,
  createOrder,
  createPaymentIntent,
  fetchMyAddresses,
  fetchGiftCard,
  fetchCheckoutOptions,
  payOrder,
  type CreatedOrder,
  type GiftCardView,
  type PaymentIntent,
  type DeliverySlot,
  type DeliveryZone,
  type StorePoint,
} from '@/lib/api';
import { loadAttribution } from '@/lib/attribution';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { guestOrderLink, saveGuestOrderAccess } from '@/lib/guest-order-access';

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
  { id: 'installment', icon: '📅', name: 'Рассрочка (условия провайдера)' },
] as const;
type PaymentChoice = (typeof PAYMENT)[number]['id'];
const STEPS = ['Получение', 'Контакты', 'Оплата', 'Подтверждение'];
type DoneState = { order: CreatedOrder; intent?: PaymentIntent; paid?: boolean };

function logisticsDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bishkek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function slotLabel(slot: DeliverySlot) {
  const format = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${format(slot.startsAt)}–${format(slot.endsAt)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, total, promoDiscount, bonusDiscount, promoCode, clear, hydrated } = useCart();
  const { user, hydrated: authHydrated, authed } = useAuth();
  const [step, setStep] = useState(0);
  const [delivery, setDelivery] = useState('pickup');
  const [pickupPoints, setPickupPoints] = useState<StorePoint[]>([]);
  const [pickupPoint, setPickupPoint] = useState('');
  const [payment, setPayment] = useState<PaymentChoice>('card');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryZoneId, setDeliveryZoneId] = useState('');
  const [deliverySlotId, setDeliverySlotId] = useState('');
  const [deliveryCapacityLoading, setDeliveryCapacityLoading] = useState(true);
  const [deliveryCapacityError, setDeliveryCapacityError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftCode, setGiftCode] = useState('');
  const [giftCard, setGiftCard] = useState<GiftCardView | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  useEffect(() => { if (user?.phone) setPhone((p) => p || user.phone); }, [user]);
  useEffect(() => {
    if (delivery !== 'courier' && payment === 'cash') setPayment('card');
  }, [delivery, payment]);
  useEffect(() => {
    if (!authHydrated) return;
    if (!user) {
      setDeliveryAddress('');
      return;
    }
    authed(fetchMyAddresses)
      .then((addresses) => setDeliveryAddress((current) => current || addresses.find((item) => item.isPrimary)?.text || addresses[0]?.text || ''))
      .catch(() => setDeliveryAddress(''));
  }, [authHydrated, user, authed]);
  useEffect(() => {
    let active = true;
    fetchCheckoutOptions(logisticsDate())
      .then((options) => {
        if (!active) return;
        const zones = options.deliveryZones;
        setPickupPoints(options.pickupPoints);
        setPickupPoint((current) => options.pickupPoints.some((point) => point.id === current) ? current : options.pickupPoints[0]?.id ?? '');
        setDeliveryZones(zones);
        const zone = zones.find((item) => item.slots.some((slot) => slot.available));
        const slot = zone?.slots.find((item) => item.available);
        setDeliveryZoneId(zone?.id ?? '');
        setDeliverySlotId(slot?.id ?? '');
        setDeliveryCapacityError(false);
      })
      .catch(() => {
        if (active) setDeliveryCapacityError(true);
      })
      .finally(() => {
        if (active) setDeliveryCapacityLoading(false);
      });
    return () => { active = false; };
  }, []);
  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());
  const selectedDeliveryZone = deliveryZones.find((zone) => zone.id === deliveryZoneId);
  const selectedDeliverySlot = selectedDeliveryZone?.slots.find((slot) => slot.id === deliverySlotId);
  const managedCourierDelivery = delivery === 'courier' && deliveryZones.length > 0;
  const deliveryFee = delivery === 'courier' && selectedDeliveryZone
    ? selectedDeliveryZone.fee
    : DELIVERY.find((d) => d.id === delivery)?.fee ?? 0;
  const selectedPickupPoint = pickupPoints.find((point) => point.id === pickupPoint);
  const payable = total + deliveryFee;
  const giftAmount = giftCard?.redeemable ? Math.min(giftCard.balance, payable) : 0;
  const dueAfterGift = Math.max(payable - giftAmount, 0);

  async function applyGiftCard() {
    const code = giftCode.trim();
    if (!code) return;
    setGiftBusy(true); setGiftError(null);
    try {
      const card = await fetchGiftCard(code);
      if (!card.redeemable || card.balance <= 0) {
        setGiftCard(null);
        setGiftError('Карта недоступна.');
        return;
      }
      setGiftCard(card);
      setGiftCode(card.code);
    } catch {
      setGiftCard(null);
      setGiftError('Карта не найдена.');
    } finally {
      setGiftBusy(false);
    }
  }

  async function place() {
    setBusy(true); setError(null);
    try {
      const orderInput = {
        channel: 'web',
        fulfillmentType: delivery as 'pickup' | 'courier' | 'express',
        paymentMode: payment === 'cash' && delivery === 'courier' ? 'cod' as const : 'prepaid' as const,
        storePointId: delivery === 'pickup' ? pickupPoint : undefined,
        deliveryAddress: delivery !== 'pickup' ? deliveryAddress.trim() : undefined,
        deliverySlot: delivery === 'pickup'
          ? selectedPickupPoint?.hours
          : selectedDeliverySlot ? slotLabel(selectedDeliverySlot) : DELIVERY.find((d) => d.id === delivery)?.meta,
        deliveryZoneId: delivery === 'courier' ? selectedDeliveryZone?.id : undefined,
        deliverySlotId: delivery === 'courier' ? selectedDeliverySlot?.id : undefined,
        total: payable,
        promoCode: promoCode ?? undefined,
        attribution: loadAttribution() ?? undefined,
        loyaltyPoints: user ? bonusDiscount : undefined,
        items: items.map((i) => ({ sku: i.sku, qty: i.qty, price: i.price })),
      } as const;
      const orderKey = crypto.randomUUID();
      let guestCapability: string | null = null;
      let order: CreatedOrder;
      if (user) {
        order = await authed((token) => createMyOrder(orderInput, token, orderKey));
      } else {
        const customer = await createCustomer({ phone: phone.trim(), name: name.trim() || undefined });
        guestCapability = customer.guestCapability;
        order = await createOrder({ ...orderInput, customerId: customer.id }, guestCapability, orderKey);
        if (order.guestAccess) saveGuestOrderAccess(order.id, order.guestAccess.capability, order.guestAccess.expiresIn);
      }
      const serverTotal = order.total;
      const serverGiftAmount = giftCard?.redeemable ? Math.min(giftCard.balance, serverTotal) : 0;
      const serverDue = Math.max(serverTotal - serverGiftAmount, 0);
      let currentOrder: CreatedOrder = order;
      if (giftCard && serverGiftAmount > 0) {
        const giftPayment = {
          orderId: order.id,
          method: 'gift_card',
          amount: serverGiftAmount,
          giftCardCode: giftCard.code,
        } as const;
        const paid = user
          ? await authed((token) => payOrder(giftPayment, { accessToken: token }))
          : await payOrder(giftPayment, { guestCapability: guestCapability! });
        currentOrder = { ...order, status: paid.order?.status ?? order.status };
      }
      if (serverDue === 0) {
        setDone({ order: currentOrder, paid: currentOrder.status === 'paid' });
        clear();
        return;
      }
      if (payment === 'cash') {
        setDone({ order: currentOrder });
        clear();
        return;
      }
      const intentInput = {
        orderId: order.id,
        method: payment,
        amount: serverDue,
      } as const;
      const intentKey = crypto.randomUUID();
      const intent = user
        ? await authed((token) => createMyPaymentIntent(intentInput, token, intentKey))
        : await createPaymentIntent({ ...intentInput, actor: 'web_checkout' }, guestCapability!, intentKey);
      setDone({ order: { ...currentOrder, status: intent.orderStatus }, intent });
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось оформить заказ.');
    } finally { setBusy(false); }
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
    <div className="checkout-shell min-h-screen bg-[#0c0c17] font-sans text-white">
      <SiteHeader />
      <main className="mx-auto w-[min(900px,92vw)] py-10 sm:py-14">
        <div className="checkout-panel overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#111120] shadow-[0_28px_90px_-55px_rgba(249,115,22,.55)]">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );

  if (done) {
    return wrap(
      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-lime/15 text-4xl">✓</div>
        <div className="mt-5 font-display text-2xl font-extrabold">{done.intent && !done.paid ? 'Ожидаем оплату' : 'Заказ оформлен!'}</div>
        <div className="mt-2.5 text-sm text-[#A79C92]">№ <span className="font-mono text-white">{done.order.id.slice(-8)}</span> · {done.order.status}. Мы свяжемся для подтверждения.</div>
        {done.order.pickupCode && (
          <div className="checkout-surface mt-4 rounded-[14px] border border-[#2E2822] bg-[#221E19] px-5 py-3">
            <div className="text-[12px] text-[#A79C92]">Код выдачи</div>
            <div className="mt-1 font-display text-xl font-extrabold text-lime">{done.order.pickupCode}</div>
          </div>
        )}
        {done.intent && !done.paid && (
          <div className="checkout-surface mt-5 w-full rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4 text-left">
            <div className="text-[13px] font-semibold text-white">{PAYMENT.find((p) => p.id === done.intent?.method)?.name}</div>
            <div className="mt-1 font-mono text-[11px] break-all text-[#8A7F76]">{done.intent.qrPayload ?? done.intent.paymentUrl}</div>
            <div className="mt-2 text-[12px] text-[#A79C92]">Sandbox intent: {done.intent.intentId} · до {new Date(done.intent.expiresAt).toLocaleTimeString('ru-RU')}</div>
            <button type="button" disabled={busy} onClick={confirmPayment} className="checkout-primary mt-3 w-full rounded-[12px] bg-lime py-3 text-center text-sm font-bold text-lime-ink disabled:opacity-60">
              {busy ? 'Проверяем…' : 'Подтвердить sandbox-платёж'}
            </button>
            {error && <p className="mt-2 text-sm text-[#FF8A7A]">{error}</p>}
          </div>
        )}
        <Link href={done.order.guestAccess ? guestOrderLink(done.order.id, done.order.guestAccess.capability) : `/account/orders/${done.order.id}`} className="checkout-primary mt-6 rounded-[13px] bg-lime px-6 py-3.5 text-sm font-bold text-lime-ink">Статус и чек</Link>
        <Link href="/" className="mt-4 text-sm text-[#A79C92]">На главную</Link>
      </div>,
    );
  }
  if (hydrated && items.length === 0) {
    return wrap(<div className="flex flex-1 flex-col items-center justify-center text-center"><p className="font-display text-lg font-bold">Корзина пуста</p><Link href="/" className="mt-3 text-sm text-lime">В каталог →</Link></div>);
  }

  return wrap(
    <>
      <div className="flex items-center gap-3 px-5 pb-3 pt-5 sm:px-7 sm:pt-7">
        <button type="button" onClick={() => (step > 0 ? setStep(step - 1) : router.back())} className="text-xl">←</button>
        <span className="font-display text-xl font-bold">Оформление</span>
      </div>
      <div className="flex gap-1.5 px-5 pb-5 sm:px-7">
        {STEPS.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-chip ${i <= step ? 'bg-lime' : 'bg-[#2E2822]'}`} />)}
      </div>

      <div className="px-5 pb-7 sm:px-7">
        {step === 0 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Способ получения</div>
            {DELIVERY.map((d) => (
              <button key={d.id} type="button" aria-pressed={delivery === d.id} onClick={() => setDelivery(d.id)} className={`checkout-surface mb-2.5 flex w-full items-center gap-3 rounded-[13px] border bg-[#221E19] p-3.5 text-left ${delivery === d.id ? 'border-lime' : 'border-[#2E2822]'}`}>
                <span className="text-2xl">{d.icon}</span>
                <div className="flex-1"><div className="text-sm font-semibold">{d.name}</div><div className="text-xs text-[#A79C92]">{d.meta}</div></div>
                <span className="text-[13px] text-[#D8CFC6]">{d.price}</span>
              </button>
            ))}
            {delivery === 'pickup' && (
              <div className="checkout-surface mb-2.5 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
                <div className="mb-2 text-[13px] font-semibold">Точка самовывоза</div>
                {pickupPoints.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => setPickupPoint(point.id)}
                    className={`checkout-nested mb-2 flex w-full items-start gap-3 rounded-[11px] border p-3 text-left last:mb-0 ${pickupPoint === point.id ? 'border-lime bg-lime/5' : 'border-[#3A342E] bg-[#16130F]'}`}
                  >
                    <span className={`mt-0.5 h-4 w-4 rounded-full border-2 ${pickupPoint === point.id ? 'border-lime bg-lime' : 'border-[#3A342E]'}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{point.name}</span>
                      <span className="mt-0.5 block text-xs text-[#A79C92]">{point.address} · {point.hours}</span>
                    </span>
                  </button>
                ))}
                {!deliveryCapacityLoading && pickupPoints.length === 0 && (
                  <p className="rounded-[10px] border border-[#6B3B32] bg-[#2A1818] p-3 text-sm text-[#FFAA9D]">Сейчас нет доступных точек самовывоза.</p>
                )}
              </div>
            )}
            {delivery !== 'pickup' && (
              <>
                <label className="checkout-surface mb-2.5 block rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
                  <span className="text-[13px] font-semibold">Точный адрес доставки</span>
                  <textarea
                    aria-label="Точный адрес доставки"
                    value={deliveryAddress}
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                    placeholder="Город, улица, дом, квартира и ориентир"
                    rows={3}
                    className="checkout-field mt-2 w-full resize-none rounded-[10px] border border-[#3A342E] bg-[#16130F] px-3 py-2.5 text-sm text-white outline-none focus:border-lime"
                  />
                </label>
                {delivery === 'courier' && deliveryCapacityLoading && (
                  <div className="checkout-surface mb-2.5 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5 text-sm text-[#A79C92]">Проверяем доступное время…</div>
                )}
                {delivery === 'courier' && deliveryCapacityError && (
                  <div className="mb-2.5 rounded-[13px] border border-[#6B3B32] bg-[#2A1818] p-3.5 text-sm text-[#FFAA9D]">Не удалось загрузить доступные точки и интервалы. Обновите страницу.</div>
                )}
                {delivery === 'courier' && deliveryZones.length > 0 && (
                  <div className="checkout-surface mb-2.5 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
                    <div className="mb-2 text-[13px] font-semibold">Зона и время доставки</div>
                    <label className="block text-[11px] text-[#A79C92]" htmlFor="delivery-zone">Зона</label>
                    <select
                      id="delivery-zone"
                      aria-label="Зона доставки"
                      value={deliveryZoneId}
                      onChange={(event) => {
                        const zone = deliveryZones.find((item) => item.id === event.target.value);
                        setDeliveryZoneId(event.target.value);
                        setDeliverySlotId(zone?.slots.find((slot) => slot.available)?.id ?? '');
                      }}
                      className="checkout-field mt-1 w-full rounded-[10px] border border-[#3A342E] bg-[#16130F] px-3 py-2.5 text-sm text-white outline-none focus:border-lime"
                    >
                      {deliveryZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {som(zone.fee)}</option>)}
                    </select>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {(selectedDeliveryZone?.slots ?? []).map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setDeliverySlotId(slot.id)}
                          className={`checkout-nested rounded-[10px] border p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-45 ${deliverySlotId === slot.id ? 'border-lime bg-lime/5' : 'border-[#3A342E] bg-[#16130F]'}`}
                        >
                          <span className="block text-sm font-semibold">{slotLabel(slot)}</span>
                          <span className="mt-0.5 block text-[11px] text-[#A79C92]">{slot.available ? `осталось ${slot.remaining}` : 'мест нет'}</span>
                        </button>
                      ))}
                    </div>
                    {(selectedDeliveryZone?.slots.length ?? 0) === 0 && <p className="mt-2 text-xs text-[#FFAA9D]">На сегодня интервалов нет.</p>}
                  </div>
                )}
              </>
            )}
            <button type="button" disabled={deliveryCapacityLoading || deliveryCapacityError || (delivery === 'pickup' && !selectedPickupPoint) || (delivery !== 'pickup' && !deliveryAddress.trim()) || (managedCourierDelivery && !selectedDeliverySlot)} onClick={() => setStep(1)} className="checkout-primary mt-2 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:opacity-50">Далее</button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Контакты</div>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+996 700 12 34 56" className="checkout-field mb-2.5 w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5 font-mono text-sm text-white outline-none focus:border-lime" />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" className="checkout-field mb-2.5 w-full rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3.5 text-sm text-white outline-none focus:border-lime" />
            {error && <p className="text-sm text-[#FF8A7A]">{error}</p>}
            <button type="button" disabled={!phoneValid} onClick={() => setStep(2)} className="checkout-primary mt-2 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]">Далее</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Оплата</div>
            {PAYMENT.filter((p) => p.id !== 'cash' || delivery === 'courier').map((p) => (
              <button key={p.id} type="button" aria-pressed={payment === p.id} onClick={() => setPayment(p.id)} className={`checkout-surface mb-2.5 flex w-full items-center gap-3 rounded-[13px] border bg-[#221E19] p-3.5 text-left ${payment === p.id ? 'border-lime' : 'border-[#2E2822]'}`}>
                <span className="text-xl">{p.icon}</span>
                <span className="flex-1 text-sm">{p.name}</span>
                <span className={`h-4.5 w-4.5 rounded-full border-2 ${payment === p.id ? 'border-lime' : 'border-[#3A342E]'}`} style={{ height: 18, width: 18 }} />
              </button>
            ))}
            <div className="checkout-surface mt-3 rounded-[13px] border border-[#2E2822] bg-[#221E19] p-3.5">
              <div className="mb-2 text-sm font-semibold">Подарочная карта</div>
              <div className="flex gap-2">
                <input value={giftCode} onChange={(e) => { setGiftCode(e.target.value); setGiftCard(null); }} placeholder="GC-ALISTORE" className="checkout-field min-w-0 flex-1 rounded-[10px] border border-[#3A342E] bg-[#16130F] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-lime" />
                <button type="button" disabled={giftBusy} onClick={applyGiftCard} className="checkout-primary rounded-[10px] bg-lime px-3 text-sm font-bold text-lime-ink disabled:opacity-60">{giftBusy ? '...' : 'OK'}</button>
              </div>
              {giftCard && <div className="mt-2 text-[12px] text-lime">Баланс {som(giftCard.balance)} · спишем {som(giftAmount)}</div>}
              {giftError && <div className="mt-2 text-[12px] text-[#FF8A7A]">{giftError}</div>}
            </div>
            <button type="button" onClick={() => setStep(3)} className="checkout-primary mt-2 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink">К подтверждению</button>
          </>
        )}
        {step === 3 && (
          <>
            <div className="mb-3 font-display text-base font-bold">Подтверждение</div>
            <div className="checkout-surface rounded-[14px] border border-[#2E2822] bg-[#221E19] p-4">
              <Row k="Получение" v={DELIVERY.find((d) => d.id === delivery)?.name ?? ''} />
              {delivery === 'pickup' && <Row k="Точка" v={selectedPickupPoint?.name ?? 'не выбрана'} />}
              {delivery !== 'pickup' && <Row k="Адрес" v={deliveryAddress || 'не указан'} />}
              {delivery === 'courier' && selectedDeliveryZone && <Row k="Зона" v={selectedDeliveryZone.name} />}
              {delivery === 'courier' && selectedDeliverySlot && <Row k="Интервал" v={slotLabel(selectedDeliverySlot)} />}
              <Row k="Оплата" v={PAYMENT.find((p) => p.id === payment)?.name ?? ''} />
              <Row k="Телефон" v={phone} />
              <Row k="Товаров" v={String(items.reduce((s, i) => s + i.qty, 0))} />
              <div className="my-2 border-t border-[#2E2822]" />
              <Row k="Товары" v={som(subtotal)} />
              {promoDiscount > 0 && <Row k={`Промокод ${promoCode ?? ''}`} v={`−${som(promoDiscount)}`} />}
              {bonusDiscount > 0 && <Row k="Бонусы" v={`−${som(bonusDiscount)}`} />}
              <Row k="Доставка" v={deliveryFee ? som(deliveryFee) : 'бесплатно'} />
              {giftAmount > 0 && <Row k={`Подарочная ${giftCard?.code ?? ''}`} v={`−${som(giftAmount)}`} />}
              <div className="flex items-center justify-between"><span className="text-[15px] font-bold">К оплате</span><span className="font-display text-lg font-extrabold text-lime">{som(dueAfterGift)}</span></div>
            </div>
            {error && <p className="mt-3 text-sm text-[#FF8A7A]">{error}</p>}
            <button type="button" disabled={busy} onClick={place} className="checkout-primary mt-3 w-full rounded-[13px] bg-lime py-3.5 text-center text-[15px] font-bold text-lime-ink disabled:opacity-60">{busy ? 'Оформляем…' : 'Подтвердить заказ'}</button>
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
