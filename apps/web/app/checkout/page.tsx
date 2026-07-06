'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { som } from '@/lib/format';
import { createCustomer, createOrder, type CreatedOrder } from '@/lib/api';

const DELIVERY = [
  { id: 'pickup', label: 'Самовывоз', note: 'Бишкек, бесплатно' },
  { id: 'courier', label: 'Курьер', note: 'по городу, 1–2 дня' },
  { id: 'express', label: 'Экспресс', note: 'сегодня' },
] as const;

const PAYMENT = [
  { id: 'cash', label: 'Наличные при получении' },
  { id: 'card', label: 'Карта' },
  { id: 'qr', label: 'QR · MBank / O!Деньги' },
  { id: 'installment', label: 'Рассрочка 0-0-12' },
] as const;

export default function CheckoutPage() {
  const { items, subtotal, clear, hydrated } = useCart();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [delivery, setDelivery] = useState<(typeof DELIVERY)[number]['id']>('pickup');
  const [payment, setPayment] = useState<(typeof PAYMENT)[number]['id']>('cash');
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatedOrder | null>(null);

  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phoneValid) {
      setError('Введите корректный номер телефона.');
      return;
    }
    setStatus('submitting');
    try {
      const customer = await createCustomer({ phone: phone.trim(), name: name.trim() || undefined });
      const order = await createOrder({
        customerId: customer.id,
        channel: 'web',
        total: subtotal,
        items: items.map((i) => ({ sku: i.sku, qty: i.qty, price: i.price })),
      });
      setDone(order);
      clear();
    } catch {
      setError('Не удалось оформить заказ. Попробуйте ещё раз или позвоните нам.');
    } finally {
      setStatus('idle');
    }
  }

  if (done) {
    return (
      <div className="py-16">
        <div className="mx-auto max-w-md rounded-card border border-ink/10 bg-white p-8 text-center shadow-soft">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime text-2xl text-lime-ink">
            ✓
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Заказ оформлен!</h1>
          <p className="mt-2 text-sm text-ink/60">
            Номер заказа <span className="font-mono font-semibold text-ink">{done.id.slice(-8)}</span>.
            Мы свяжемся с вами для подтверждения.
          </p>
          <p className="mt-1 font-mono text-xs text-ink/40">статус: {done.status}</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-btn bg-coral px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-deep"
          >
            Вернуться в каталог
          </Link>
        </div>
      </div>
    );
  }

  if (hydrated && items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-xl font-bold text-ink">Корзина пуста</p>
        <Link href="/" className="mt-4 inline-flex text-sm text-coral hover:text-deep">
          В каталог →
        </Link>
      </div>
    );
  }

  return (
    <div className="py-8">
      <h1 className="mb-6 font-display text-3xl font-extrabold text-ink">Оформление</h1>

      <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-8">
          <Section title="Контакты">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Телефон *">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+996 700 123 456"
                  className="input"
                  required
                />
              </Field>
              <Field label="Имя">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Как к вам обращаться"
                  className="input"
                />
              </Field>
            </div>
          </Section>

          <Section title="Доставка">
            <div className="grid gap-3 sm:grid-cols-3">
              {DELIVERY.map((d) => (
                <Choice
                  key={d.id}
                  active={delivery === d.id}
                  onClick={() => setDelivery(d.id)}
                  label={d.label}
                  note={d.note}
                />
              ))}
            </div>
          </Section>

          <Section title="Оплата">
            <div className="grid gap-3 sm:grid-cols-2">
              {PAYMENT.map((p) => (
                <Choice
                  key={p.id}
                  active={payment === p.id}
                  onClick={() => setPayment(p.id)}
                  label={p.label}
                />
              ))}
            </div>
          </Section>
        </div>

        <aside className="h-fit rounded-card border border-ink/10 bg-white p-6 shadow-soft lg:sticky lg:top-24">
          <p className="font-display text-sm font-bold text-ink">Ваш заказ</p>
          <ul className="mt-3 flex flex-col gap-2 border-b border-ink/10 pb-4">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink/70">
                  {i.name} <span className="text-ink/40">× {i.qty}</span>
                </span>
                <span className="font-mono tabular text-ink">{som(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-ink/60">Итого</span>
            <span className="font-mono text-2xl font-bold tabular text-ink">{som(subtotal)}</span>
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="mt-5 block w-full rounded-btn bg-coral py-3 text-center text-base font-semibold text-white transition hover:bg-deep disabled:bg-ink/20"
          >
            {status === 'submitting' ? 'Оформляем…' : 'Подтвердить заказ'}
          </button>
          <p className="mt-3 text-center text-xs text-ink/45">
            Нажимая, вы соглашаетесь с условиями и обработкой данных.
          </p>
        </aside>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-ink/10 bg-white p-6 shadow-soft">
      <h2 className="mb-4 font-display text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink/70">{label}</span>
      {children}
    </label>
  );
}

function Choice({
  active,
  onClick,
  label,
  note,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-btn border px-4 py-3 text-left transition',
        active
          ? 'border-coral bg-tint ring-2 ring-coral/30'
          : 'border-ink/15 bg-white hover:border-ink/30',
      ].join(' ')}
    >
      <span className="block text-sm font-semibold text-ink">{label}</span>
      {note && <span className="block text-xs text-ink/50">{note}</span>}
    </button>
  );
}
