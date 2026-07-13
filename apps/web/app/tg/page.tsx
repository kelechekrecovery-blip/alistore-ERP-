'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  createCustomer,
  createOrder,
  createPaymentIntent,
  type CatalogProduct,
  type CreatedOrder,
  fetchCatalog,
  type OnlinePaymentMethod,
  type PaymentIntent,
} from '@/lib/api';
import { som, conditionLabel } from '@/lib/format';

type TgUser = {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
};

type TgWebApp = {
  initDataUnsafe?: { user?: TgUser };
  ready?: () => void;
  expand?: () => void;
};

type CartLine = Pick<CatalogProduct, 'id' | 'sku' | 'name' | 'price'> & { qty: number };
type PaymentChoice = 'cash' | OnlinePaymentMethod;
type DoneState = { order: CreatedOrder; intent?: PaymentIntent };

const CATEGORY_ICON: Record<string, string> = {
  Смартфоны: '📱',
  Ноутбуки: '💻',
  Планшеты: '📲',
  Аудио: '🎧',
  Часы: '⌚',
};

function telegramApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const maybe = window as Window & { Telegram?: { WebApp?: TgWebApp } };
  return maybe.Telegram?.WebApp ?? null;
}

function productIcon(category: string): string {
  return CATEGORY_ICON[category] ?? '📦';
}

export default function TelegramMiniAppPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [mode, setMode] = useState<'catalog' | 'checkout'>('catalog');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [payment, setPayment] = useState<PaymentChoice>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<DoneState | null>(null);

  useEffect(() => {
    const tg = telegramApp();
    tg?.ready?.();
    tg?.expand?.();
    const user = tg?.initDataUnsafe?.user;
    if (user) {
      setName([user.first_name, user.last_name].filter(Boolean).join(' '));
      if (user.phone_number) setPhone(user.phone_number);
    }
  }, []);

  useEffect(() => {
    fetchCatalog({ limit: 100 })
      .then((catalog) => setProducts(catalog.items))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = category === 'all' || product.category === category;
      const queryMatch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q);
      return categoryMatch && queryMatch;
    });
  }, [category, products, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const phoneValid = /^\+?[0-9]{9,15}$/.test(phone.trim());

  function add(product: CatalogProduct) {
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.id === product.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        {
          id: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          qty: 1,
        },
      ];
    });
  }

  function setQty(id: string, qty: number) {
    setCart((current) =>
      qty <= 0
        ? current.filter((line) => line.id !== id)
        : current.map((line) => (line.id === id ? { ...line, qty } : line)),
    );
  }

  async function placeOrder() {
    if (cart.length === 0 || !phoneValid) return;
    setBusy(true);
    setError('');
    try {
      const customer = await createCustomer({
        phone: phone.trim(),
        name: name.trim() || 'Telegram customer',
      });
      const order = await createOrder({
        customerId: customer.id,
        channel: 'telegram',
        fulfillmentType: 'pickup',
        pickupPoint: 'alistore-center',
        deliverySlot: 'AliStore Центр · сегодня',
        total: subtotal,
        items: cart.map((line) => ({ sku: line.sku, qty: line.qty, price: line.price })),
      }, customer.guestCapability, crypto.randomUUID());
      if (payment === 'cash') {
        setDone({ order });
        setCart([]);
        return;
      }
      const intent = await createPaymentIntent({
        orderId: order.id,
        method: payment,
        amount: subtotal,
        actor: 'telegram_mini_app',
      }, customer.guestCapability, crypto.randomUUID());
      setDone({ order: { ...order, status: intent.orderStatus }, intent });
      setCart([]);
    } catch {
      setError('Не удалось оформить заказ. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-lime/15 text-4xl">✓</div>
          <h1 className="mt-5 font-display text-2xl font-extrabold">
            {done.intent ? 'Счёт создан' : 'Заказ в Telegram оформлен'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#A79C92]">
            № <span className="font-mono text-white">{done.order.id.slice(-8)}</span> · channel=telegram · {done.order.status}
          </p>
          {done.intent && (
            <div className="mt-5 w-full rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4 text-left">
              <div className="text-sm font-bold text-white">Sandbox payment</div>
              <div className="mt-1 break-all font-mono text-[11px] text-[#8A7F76]">
                {done.intent.qrPayload ?? done.intent.paymentUrl}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setMode('catalog');
            }}
            className="mt-6 rounded-[13px] bg-lime px-6 py-3.5 text-sm font-bold text-lime-ink"
          >
            Вернуться в каталог
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex-shrink-0 border-b border-[#2E2822] px-4 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[12px] bg-lime font-display text-lg font-extrabold text-lime-ink">
            A
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-extrabold">AliStore Mini</h1>
            <p className="mt-0.5 text-xs text-[#8A7F76]">Telegram shell · общий каталог и checkout</p>
          </div>
          <Link href="/" className="ml-auto rounded-chip border border-[#2E2822] px-3 py-2 text-xs font-semibold text-[#A79C92]">
            web
          </Link>
        </div>
      </header>

      {mode === 'catalog' ? (
        <>
          <section className="flex-shrink-0 px-4 py-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск в Mini App"
              className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime"
            />
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`flex-shrink-0 rounded-[12px] border px-3 py-2 text-xs font-bold ${
                  category === 'all' ? 'border-lime bg-lime text-lime-ink' : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
                }`}
              >
                Все
              </button>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`flex-shrink-0 rounded-[12px] border px-3 py-2 text-xs font-bold ${
                    category === item ? 'border-lime bg-lime text-lime-ink' : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
                  }`}
                >
                  {productIcon(item)} {item}
                </button>
              ))}
            </div>
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
            {loading ? (
              <p className="py-8 font-mono text-sm text-[#8A7F76]">Загрузка…</p>
            ) : visibleProducts.length === 0 ? (
              <p className="py-8 text-sm text-[#8A7F76]">Ничего не найдено.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {visibleProducts.map((product) => {
                  const inStock = product.availableUnits > 0;
                  const used = conditionLabel(product.attrs) === 'Б/У';
                  return (
                    <article key={product.id} className="overflow-hidden rounded-[16px] border border-[#2E2822] bg-[#221E19]">
                      <div className="grid h-[104px] place-items-center bg-gradient-to-br from-[#2A2620] to-[#16130F]">
                        <span className="text-4xl">{productIcon(product.category)}</span>
                      </div>
                      <div className="p-3">
                        <div className="min-h-[38px] text-[13px] font-bold leading-tight">{product.name}</div>
                        <div className="mt-1 font-display text-base font-extrabold">{som(product.price)}</div>
                        <div className={`mt-0.5 text-[10px] ${inStock ? 'text-[#8A7F76]' : 'text-[#FF8A7A]'}`}>
                          {used ? 'Б/У · ' : ''}{inStock ? `${product.availableUnits} в наличии` : 'под заказ'}
                        </div>
                        <button
                          type="button"
                          disabled={!inStock}
                          onClick={() => add(product)}
                          className="mt-2.5 w-full rounded-[10px] bg-lime py-2 text-xs font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
                        >
                          Добавить
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {cart.length > 0 && (
            <div className="absolute bottom-0 left-1/2 w-full max-w-[440px] -translate-x-1/2 border-t border-[#2E2822] bg-[#16130F]/95 p-4 backdrop-blur">
              <button
                type="button"
                onClick={() => setMode('checkout')}
                className="flex w-full items-center justify-between rounded-[14px] bg-lime px-4 py-3.5 text-sm font-bold text-lime-ink"
              >
                <span>Оформить · {count} шт.</span>
                <span>{som(subtotal)}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <Checkout
          cart={cart}
          subtotal={subtotal}
          phone={phone}
          name={name}
          payment={payment}
          busy={busy}
          error={error}
          phoneValid={phoneValid}
          onBack={() => setMode('catalog')}
          onPhone={setPhone}
          onName={setName}
          onPayment={setPayment}
          onQty={setQty}
          onPlace={() => void placeOrder()}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#0E0C0A] font-sans">
      <div className="relative flex h-full w-full max-w-[440px] flex-col bg-[#16130F] text-white">
        {children}
      </div>
    </div>
  );
}

function Checkout({
  cart,
  subtotal,
  phone,
  name,
  payment,
  busy,
  error,
  phoneValid,
  onBack,
  onPhone,
  onName,
  onPayment,
  onQty,
  onPlace,
}: {
  cart: CartLine[];
  subtotal: number;
  phone: string;
  name: string;
  payment: PaymentChoice;
  busy: boolean;
  error: string;
  phoneValid: boolean;
  onBack: () => void;
  onPhone: (value: string) => void;
  onName: (value: string) => void;
  onPayment: (value: PaymentChoice) => void;
  onQty: (id: string, qty: number) => void;
  onPlace: () => void;
}) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
      <button type="button" onClick={onBack} className="mb-4 text-sm font-semibold text-lime">
        ← Каталог
      </button>
      <h2 className="font-display text-xl font-extrabold">Checkout в Telegram</h2>

      <div className="mt-4 space-y-2">
        {cart.map((line) => (
          <div key={line.id} className="flex items-center gap-3 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{line.name}</div>
              <div className="mt-1 font-mono text-xs text-[#8A7F76]">{line.sku}</div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onQty(line.id, line.qty - 1)} className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#16130F] text-sm font-bold">−</button>
              <span className="w-6 text-center font-mono text-sm">{line.qty}</span>
              <button type="button" onClick={() => onQty(line.id, line.qty + 1)} className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#16130F] text-sm font-bold">+</button>
            </div>
          </div>
        ))}
      </div>

      <label className="mb-1.5 mt-5 block text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">Телефон</label>
      <input
        value={phone}
        onChange={(event) => onPhone(event.target.value)}
        placeholder="+996700900007"
        inputMode="tel"
        className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime"
      />
      <label className="mb-1.5 mt-3 block text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">Имя</label>
      <input
        value={name}
        onChange={(event) => onName(event.target.value)}
        placeholder="Имя в Telegram"
        className="w-full rounded-[13px] border border-[#2E2822] bg-[#221E19] px-4 py-3 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime"
      />

      <div className="mt-5 grid grid-cols-2 gap-2">
        {[
          ['cash', 'При получении'],
          ['qr_mbank', 'MBank QR'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onPayment(id as PaymentChoice)}
            className={`rounded-[13px] border px-3 py-3 text-sm font-bold ${
              payment === id ? 'border-lime bg-lime text-lime-ink' : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-[16px] border border-[#2E2822] bg-[#221E19] p-4">
        <div className="flex items-center justify-between text-sm text-[#A79C92]">
          <span>Итого</span>
          <span className="font-display text-xl font-extrabold text-lime">{som(subtotal)}</span>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#FF8A7A]">{error}</p>}
      <button
        type="button"
        disabled={busy || !phoneValid || cart.length === 0}
        onClick={onPlace}
        className="mt-4 w-full rounded-[14px] bg-lime py-3.5 text-sm font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
      >
        {busy ? 'Оформляем…' : 'Подтвердить в Mini App'}
      </button>
    </section>
  );
}
