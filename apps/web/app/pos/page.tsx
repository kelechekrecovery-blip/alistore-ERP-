'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog, posSale, type CatalogProduct, type PosSaleResult } from '@/lib/api';
import { som } from '@/lib/format';

const STAFF_ID = 'pos_azizbek';
const POINT = 'BISHKEK-1';
const CASHIER = 'Азизбек';
const SHOP = 'AliStore Центр';
const DISCOUNTS = [0, 5, 10, 15];
const METHODS: { id: string; icon: string; name: string }[] = [
  { id: 'cash', icon: '💵', name: 'Наличные' },
  { id: 'card', icon: '💳', name: 'Карта' },
  { id: 'qr_mbank', icon: '📱', name: 'MBank QR' },
  { id: 'qr_odengi', icon: '📱', name: 'O!Деньги' },
  { id: 'bakai_pos', icon: '🏦', name: 'Bakai POS' },
  { id: 'obank', icon: '🏦', name: 'О!Банк' },
  { id: 'installment', icon: '📅', name: 'Рассрочка' },
];

export default function PosPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cat, setCat] = useState('all');
  const [ticket, setTicket] = useState<Record<string, number>>({});
  const [discIdx, setDiscIdx] = useState(0);
  const [route, setRoute] = useState<'sell' | 'pay' | 'done'>('sell');
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [result, setResult] = useState<PosSaleResult | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items));
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );
  const grid = products.filter((p) => cat === 'all' || p.category === cat);

  const lines = Object.entries(ticket).map(([id, qty]) => ({ product: byId.get(id)!, qty }));
  const subtotal = lines.reduce((s, l) => s + (l.product?.price ?? 0) * l.qty, 0);
  const discPct = DISCOUNTS[discIdx];
  const total = Math.round(subtotal * (1 - discPct / 100));
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(''), 1600);
  }

  function add(p: CatalogProduct) {
    setTicket((t) => {
      const cur = t[p.id] ?? 0;
      if (p.availableUnits > 0 && cur >= p.availableUnits) {
        flash('Больше нет в наличии');
        return t;
      }
      return { ...t, [p.id]: cur + 1 };
    });
  }
  function setQty(id: string, qty: number) {
    setTicket((t) => {
      if (qty <= 0) {
        const { [id]: _, ...rest } = t;
        return rest;
      }
      const p = byId.get(id);
      const capped = p && p.availableUnits > 0 ? Math.min(qty, p.availableUnits) : qty;
      return { ...t, [id]: capped };
    });
  }

  async function finish() {
    if (!method) return;
    setBusy(true);
    try {
      const res = await posSale({
        staffId: STAFF_ID,
        point: POINT,
        method,
        discountPct: discPct,
        lines: lines.map((l) => ({
          productId: l.product.id,
          sku: l.product.sku,
          price: l.product.price,
          qty: l.qty,
        })),
      });
      setResult(res);
      setRoute('done');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Ошибка продажи');
    } finally {
      setBusy(false);
    }
  }

  function newSale() {
    setTicket({});
    setDiscIdx(0);
    setMethod(null);
    setResult(null);
    setRoute('sell');
    fetchCatalog({ limit: 100 }).then((c) => setProducts(c.items)); // refresh stock
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E0C0A] p-4 font-sans text-white">
      <Link
        href="/"
        className="fixed right-4 top-4 z-[60] rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
      >
        ⌂ Выйти
      </Link>

      <div className="flex h-[820px] max-h-[95vh] w-full max-w-[1180px] overflow-hidden rounded-[24px] border-8 border-[#201B17] bg-[#16130F] shadow-2xl">
        {/* LEFT: catalog */}
        <div className="flex flex-1 flex-col border-r border-[#2E2822]">
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#2E2822] px-5 py-4">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display text-lg font-extrabold text-white">
              A
            </span>
            <div>
              <div className="font-display text-base font-bold text-white">POS · Касса</div>
              <div className="text-xs text-[#8A7F76]">
                Смена · {CASHIER} · {SHOP}
              </div>
            </div>
            <span className="ml-auto rounded-chip bg-lime/10 px-3 py-1.5 text-xs text-lime">
              ● онлайн
            </span>
          </div>

          <div className="flex flex-shrink-0 gap-2 overflow-x-auto px-5 pb-2 pt-4">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`flex-shrink-0 whitespace-nowrap rounded-chip border px-4 py-2 text-sm font-semibold transition ${
                  cat === c
                    ? 'border-lime bg-lime text-lime-ink'
                    : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6] hover:border-[#3A342E]'
                }`}
              >
                {c === 'all' ? 'Все' : c}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2">
            <div className="grid grid-cols-3 gap-3">
              {grid.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  className="rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3 text-left transition hover:border-lime/40"
                >
                  <div className="relative mb-2.5 grid h-20 place-items-center rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F]">
                    <span className="font-display text-3xl font-extrabold text-white/15">
                      {p.name.slice(0, 1)}
                    </span>
                    {p.availableUnits < 5 && (
                      <span className="absolute right-1.5 top-1.5 rounded bg-warn px-1.5 py-0.5 text-[9px] font-bold text-lime-ink">
                        {p.availableUnits} шт
                      </span>
                    )}
                  </div>
                  <div className="min-h-[34px] text-[13px] font-semibold leading-tight text-white">
                    {p.name}
                  </div>
                  <div className="mt-1 font-display text-[15px] font-extrabold text-lime tabular">
                    {som(p.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: receipt */}
        <div className="flex w-[420px] flex-shrink-0 flex-col bg-[#1A1611]">
          <div className="flex flex-shrink-0 items-center border-b border-[#2E2822] px-5 py-4">
            <span className="font-display text-[17px] font-bold text-white">Чек</span>
            <span className="ml-2 text-sm text-[#8A7F76]">{count} поз.</span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => setTicket({})}
                className="ml-auto text-sm text-[#FF8A7A] hover:text-danger"
              >
                Очистить
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            {lines.length === 0 ? (
              <div className="py-16 text-center text-[#6E645C]">
                <div className="text-5xl">🧾</div>
                <div className="mt-3 text-sm">Добавьте товары тапом</div>
              </div>
            ) : (
              lines.map((l) => (
                <div key={l.product.id} className="flex gap-3 border-b border-[#221E19] py-3">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[9px] bg-[#2A2620] font-display font-extrabold text-white/20">
                    {l.product.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white">{l.product.name}</div>
                    <div className="mt-0.5 text-xs text-[#8A7F76]">{som(l.product.price)}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex items-center gap-3 rounded-[7px] bg-[#221E19] px-2 py-1">
                        <button type="button" onClick={() => setQty(l.product.id, l.qty - 1)} className="text-white">
                          −
                        </button>
                        <span className="font-mono text-[13px] text-white">{l.qty}</span>
                        <button type="button" onClick={() => setQty(l.product.id, l.qty + 1)} className="text-white">
                          +
                        </button>
                      </div>
                      <span className="ml-auto font-display text-sm font-bold text-white tabular">
                        {som(l.product.price * l.qty)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {count > 0 && (
            <div className="flex-shrink-0 border-t border-[#2E2822] px-5 py-4">
              <div className="mb-3 flex gap-2">
                {DISCOUNTS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDiscIdx(i)}
                    className={`flex-1 rounded-[9px] border py-2 text-center text-xs font-semibold transition ${
                      discIdx === i
                        ? 'border-lime bg-lime text-lime-ink'
                        : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
                    }`}
                  >
                    {d}%
                  </button>
                ))}
              </div>
              <div className="flex justify-between py-0.5 text-[13px] text-[#A79C92]">
                Подытог <span className="text-[#D8CFC6] tabular">{som(subtotal)}</span>
              </div>
              {discPct > 0 && (
                <div className="flex justify-between py-0.5 text-[13px] text-lime">
                  Скидка {discPct}% <span className="tabular">−{som(subtotal - total)}</span>
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-display text-[17px] font-bold text-white">Итого</span>
                <span className="font-display text-[22px] font-extrabold text-lime tabular">
                  {som(total)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMethod(null);
                  setRoute('pay');
                }}
                className="mt-3 w-full rounded-[12px] bg-lime py-3.5 text-center text-base font-bold text-lime-ink transition hover:brightness-95"
              >
                К оплате
              </button>
            </div>
          )}
        </div>

        {/* PAYMENT OVERLAY */}
        {(route === 'pay' || route === 'done') && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(10,8,6,0.82)] p-4">
            <div className="w-full max-w-[640px] rounded-[22px] border border-[#2E2822] bg-[#1A1611] p-7">
              {route === 'pay' && (
                <>
                  <div className="mb-1 flex items-center">
                    <span className="font-display text-xl font-bold text-white">Оплата</span>
                    <span className="ml-auto font-display text-2xl font-extrabold text-lime tabular">
                      {som(total)}
                    </span>
                  </div>
                  <div className="mb-4 text-[13px] text-[#8A7F76]">Выберите способ оплаты</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {METHODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={`flex items-center gap-2.5 rounded-[12px] border bg-[#221E19] p-3.5 text-left transition ${
                          method === m.id ? 'border-lime ring-1 ring-lime/40' : 'border-[#2E2822] hover:border-[#3A342E]'
                        }`}
                      >
                        <span className="text-xl">{m.icon}</span>
                        <span className="text-sm font-semibold text-white">{m.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 flex gap-2.5">
                    <button
                      type="button"
                      disabled={!method || busy}
                      onClick={finish}
                      className="flex-1 rounded-[12px] py-3.5 text-center text-[15px] font-bold transition disabled:cursor-not-allowed"
                      style={{
                        background: method && !busy ? '#C6FF3D' : '#3A342E',
                        color: method && !busy ? '#14110E' : '#6E645C',
                      }}
                    >
                      {busy ? 'Проводим…' : 'Завершить продажу'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoute('sell')}
                      className="rounded-[12px] border border-[#2E2822] bg-[#221E19] px-6 py-3.5 text-[15px] font-semibold text-[#D8CFC6]"
                    >
                      Отмена
                    </button>
                  </div>
                </>
              )}
              {route === 'done' && result && (
                <div className="py-5 text-center">
                  <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-lime/15 text-4xl text-lime">
                    ✓
                  </div>
                  <div className="mt-4 font-display text-2xl font-extrabold text-white">
                    Продажа завершена
                  </div>
                  <div className="mt-2 text-sm text-[#A79C92]">
                    Чек {result.receiptNo} · {som(result.total)} · записано в Event Ledger
                  </div>
                  {result.imeis.length > 0 && (
                    <div className="mt-2 font-mono text-xs text-[#6E645C]">
                      IMEI: {result.imeis.join(', ')}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={newSale}
                    className="mt-6 rounded-[11px] bg-lime px-6 py-3 font-bold text-lime-ink"
                  >
                    Новая продажа
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[12px] bg-lime px-6 py-3 text-sm font-semibold text-lime-ink">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
