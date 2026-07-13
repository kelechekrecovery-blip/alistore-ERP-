'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  exchangeDevice,
  fetchCatalog,
  fetchUnit,
  type CatalogProduct,
  type ExchangeResult,
  type UnitLookup,
} from '@/lib/api';
import { som } from '@/lib/format';
import { StaffSessionLogin } from '@/components/StaffSessionLogin';
import { clearStaffSession, loadStaffSession, type StaffSession } from '@/lib/staff-session';

const METHODS = [
  { id: 'cash', name: '💵 Наличные' },
  { id: 'card', name: '💳 Карта' },
  { id: 'qr_mbank', name: '📱 MBank' },
];
export default function ExchangePage() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [imei, setImei] = useState('');
  const [unit, setUnit] = useState<UnitLookup | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [newId, setNewId] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ExchangeResult | null>(null);
  const exchangeKey = useRef(crypto.randomUUID());

  useEffect(() => {
    setSession(loadStaffSession());
    setHydrated(true);
    fetchCatalog({ limit: 100, stockOnly: true }).then((c) => setProducts(c.items)).catch(() => setProducts([]));
  }, []);

  const newProduct = products.find((p) => p.id === newId) ?? null;
  const surcharge = unit && newProduct ? newProduct.price - unit.price : 0;
  const canSubmit = !!unit && unit.status === 'sold' && !!unit.orderId && !!newProduct && surcharge >= 0;

  async function lookup() {
    if (!imei.trim() || !session) return;
    setErr(''); setUnit(null); setBusy(true);
    try {
      setUnit(await fetchUnit(imei.trim(), session.accessToken));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'IMEI не найден');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!unit?.orderId || !newProduct || !session) return;
    setErr(''); setBusy(true);
    try {
      const r = await exchangeDevice({
        originalOrderId: unit.orderId,
        oldImei: unit.imei,
        newProductId: newProduct.id,
        method,
      }, session.accessToken, exchangeKey.current);
      setResult(r);
      exchangeKey.current = crypto.randomUUID();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка обмена');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setImei(''); setUnit(null); setNewId(''); setResult(null); setErr('');
  }

  function logout() {
    clearStaffSession();
    setSession(null);
    reset();
  }

  if (!hydrated) {
    return <div className="fixed inset-0 z-50 grid place-items-center bg-[#0E0C0A] font-mono text-sm text-[#8A7F76]">Загрузка…</div>;
  }

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#0E0C0A] p-5 font-sans">
        <StaffSessionLogin
          title="Обмен · вход"
          caption="Нужна роль кассира, продавца или администратора."
          onAuthenticated={setSession}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E0C0A] font-sans text-white">
      <header className="flex items-center gap-4 border-b border-[#2E2822] bg-[#16130F] px-6 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display text-lg font-extrabold text-white">⇄</span>
        <div>
          <div className="font-display text-lg font-bold">Обмен товара</div>
          <div className="text-xs text-[#8A7F76]">Возврат старого + продажа нового + доплата</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-[#8A7F76] sm:inline">{session.username} · {session.role}</span>
          <button type="button" onClick={logout} className="rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white">Выйти</button>
          <Link href="/pos" className="rounded-chip bg-[#221E19] px-4 py-2 text-xs font-semibold text-white/80 hover:text-white">⌂ POS</Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-[560px]">
          {result ? (
            <div className="rounded-[18px] border border-[#2E2822] bg-[#1A1611] p-7 text-center">
              <div className="mx-auto grid h-[76px] w-[76px] place-items-center rounded-full bg-lime/15 text-4xl text-lime">✓</div>
              <div className="mt-4 font-display text-2xl font-extrabold">Обмен оформлен</div>
              <div className="mt-2 text-sm text-[#A79C92]">
                {result.oldImei} → {result.newImei}
              </div>
              <div className="mt-1 text-sm text-[#A79C92]">
                Доплата: <span className="font-mono text-lime">{som(result.surcharge)}</span> · заказ #{result.exchangeOrderId.slice(-6)}
              </div>
              <button type="button" onClick={reset} className="mt-6 rounded-[11px] bg-lime px-6 py-3 font-bold text-lime-ink">Новый обмен</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* step 1: old device */}
              <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">1 · Возвращаемое устройство</div>
                <div className="flex gap-2">
                  <input
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookup()}
                    placeholder="IMEI проданного устройства"
                    className="flex-1 rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-sm outline-none focus:border-coral"
                  />
                  <button type="button" disabled={busy} onClick={lookup} className="rounded-[10px] bg-[#221E19] px-4 py-2.5 text-sm font-semibold text-[#D8CFC6] hover:bg-[#2A241F] disabled:opacity-40">Найти</button>
                </div>
                {unit && (
                  <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{unit.product}</div>
                      <div className="font-mono text-[11px] text-[#8A7F76]">{unit.imei} · {som(unit.price)}</div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${unit.status === 'sold' ? 'bg-lime/15 text-lime' : 'bg-warn/15 text-warn'}`}>
                      {unit.status === 'sold' ? 'продан' : unit.status}
                    </span>
                  </div>
                )}
                {unit && unit.status !== 'sold' && (
                  <div className="mt-2 text-xs text-[#FF8A7A]">Устройство не в статусе «продан» — обмен невозможен.</div>
                )}
              </div>

              {/* step 2: new device */}
              <div className={`rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5 ${!unit ? 'opacity-40' : ''}`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">2 · Новое устройство</div>
                <select
                  value={newId}
                  disabled={!unit}
                  onChange={(e) => setNewId(e.target.value)}
                  className="w-full rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-sm outline-none focus:border-coral"
                >
                  <option value="">— выберите товар —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {som(p.price)}</option>
                  ))}
                </select>
                {unit && newProduct && (
                  <div className="mt-3 flex items-center justify-between rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3 text-sm">
                    <span className="text-[#A79C92]">Доплата</span>
                    <span className={`font-mono text-lg font-bold ${surcharge >= 0 ? 'text-lime' : 'text-[#FF8A7A]'}`}>{som(surcharge)}</span>
                  </div>
                )}
                {unit && newProduct && surcharge < 0 && (
                  <div className="mt-2 text-xs text-[#FF8A7A]">Новый товар дешевле — оформите возврат, а не обмен.</div>
                )}
              </div>

              {/* step 3: method + submit */}
              <div className={`rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5 ${!canSubmit ? 'opacity-40' : ''}`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">3 · Доплата — способ</div>
                <div className="flex gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!canSubmit}
                      onClick={() => setMethod(m.id)}
                      className={`flex-1 rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition ${
                        method === m.id ? 'border-lime bg-lime/10 text-lime' : 'border-[#2E2822] bg-[#221E19] text-[#D8CFC6]'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!canSubmit || busy}
                  onClick={submit}
                  className="mt-4 w-full rounded-[12px] bg-lime py-3.5 text-[15px] font-bold text-lime-ink disabled:bg-[#3A342E] disabled:text-[#6E645C]"
                >
                  {busy ? 'Проводим…' : 'Оформить обмен'}
                </button>
              </div>

              {err && <div className="rounded-[12px] border border-[#FF8A7A]/30 bg-[#FF8A7A]/5 p-3 text-sm text-[#FF8A7A]">{err}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
