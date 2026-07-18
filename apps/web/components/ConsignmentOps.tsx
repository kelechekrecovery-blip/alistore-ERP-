'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createConsignmentPayout,
  fetchCatalog,
  fetchConsignmentPayouts,
  fetchConsignmentAdjustments,
  fetchConsignments,
  fetchQuantityConsignments,
  payConsignmentPayout,
  receiveConsignment,
  receiveQuantityConsignment,
  type CatalogProduct,
  type ConsignmentItem,
  type ConsignmentAdjustment,
  type ConsignmentPayout,
  type QuantityConsignmentLot,
} from '@/lib/api';
import { som } from '@/lib/format';

export function ConsignmentOps({ accessToken, role }: { accessToken: string; role: string }) {
  const canPayout = role === 'owner' || role === 'admin';
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [payouts, setPayouts] = useState<ConsignmentPayout[]>([]);
  const [quantityLots, setQuantityLots] = useState<QuantityConsignmentLot[]>([]);
  const [adjustments, setAdjustments] = useState<ConsignmentAdjustment[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ mode: 'serialized', productId: '', imei: '', quantity: '1', location: 'BISHKEK-1', ownerName: '', ownerContact: '', commissionPct: '10', grade: 'B' });

  const load = useCallback(async () => {
    const [catalog, consignments, quantityRows, payoutRows, adjustmentRows] = await Promise.all([
      fetchCatalog({ limit: 100 }),
      fetchConsignments(accessToken),
      fetchQuantityConsignments(accessToken),
      canPayout ? fetchConsignmentPayouts(accessToken) : Promise.resolve([]),
      canPayout ? fetchConsignmentAdjustments(accessToken) : Promise.resolve([]),
    ]);
    const eligible = catalog.items.filter((product) => (product.bundleComponents?.length ?? 0) === 0);
    setProducts(eligible);
    setItems(consignments);
    setQuantityLots(quantityRows);
    setPayouts(payoutRows);
    setAdjustments(adjustmentRows);
    setForm((current) => ({ ...current, productId: eligible.find((product) => product.trackingMode === current.mode)?.id || '' }));
  }, [accessToken, canPayout]);

  useEffect(() => {
    load().catch(() => setMessage('Не удалось загрузить комиссионный склад'));
  }, [load]);

  const settleable = useMemo(() => items.filter((item) => item.status === 'sold' && item.saleOrder?.status === 'completed' && !item.payout), [items]);
  const chosen = settleable.filter((item) => selected.includes(item.id));
  const chosenOwner = chosen[0]?.ownerName;
  const chosenTotal = chosen.reduce((sum, item) => sum + (item.ownerAmount ?? 0), 0);

  async function submitReceive() {
    if (!form.productId || !form.ownerName.trim() || (form.mode === 'serialized' && !form.imei.trim())) return;
    setBusy('receive');
    try {
      const common = { idempotencyKey: crypto.randomUUID(), productId: form.productId, location: form.location.trim(), ownerName: form.ownerName.trim(), ownerContact: form.ownerContact.trim() || undefined, commissionBps: Math.round(Number(form.commissionPct) * 100) };
      if (form.mode === 'quantity') {
        await receiveQuantityConsignment({ ...common, quantity: Math.max(1, Number(form.quantity)) }, accessToken);
      } else {
        await receiveConsignment({ ...common, imei: form.imei.trim(), grade: form.grade }, accessToken);
      }
      setForm((current) => ({ ...current, imei: '', ownerName: '', ownerContact: '' }));
      setMessage(form.mode === 'quantity' ? 'Комиссионная партия принята' : 'Комиссионный товар принят');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка приёмки');
    } finally {
      setBusy('');
    }
  }

  async function makePayout() {
    if (!canPayout || chosen.length === 0) return;
    setBusy('payout');
    try {
      await createConsignmentPayout(crypto.randomUUID(), chosen.map((item) => item.id), [], accessToken);
      setSelected([]);
      setMessage(`Выплата ${chosenOwner}: ${som(chosenTotal)} создана`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка выплаты');
    } finally {
      setBusy('');
    }
  }

  async function makeQuantityPayout(allocationId: string, ownerName: string, ownerAmount: number) {
    if (!canPayout) return;
    setBusy(allocationId);
    try {
      await createConsignmentPayout(crypto.randomUUID(), [], [allocationId], accessToken);
      setMessage(`Выплата ${ownerName}: ${som(ownerAmount)} создана`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка выплаты');
    } finally {
      setBusy('');
    }
  }

  async function markPaid(payout: ConsignmentPayout) {
    setBusy(payout.id);
    try {
      await payConsignmentPayout(payout.id, crypto.randomUUID(), accessToken);
      setMessage(`Выплата ${payout.ownerName} проведена`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка проведения');
    } finally {
      setBusy('');
    }
  }

  function toggle(item: ConsignmentItem) {
    const incompatible = chosen.length > 0 && (item.ownerName !== chosen[0].ownerName || item.ownerContact !== chosen[0].ownerContact);
    if (incompatible) {
      setMessage('В одну выплату можно выбрать товары только одного владельца');
      return;
    }
    setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
  }

  return (
    <section className="mb-4 border-y border-surface-3 bg-ink-dark py-5" aria-label="Комиссионный склад">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-4">
        <div>
          <h2 className="font-display text-base font-bold text-white">Комиссионный товар</h2>
          <p className="mt-1 text-xs text-subtle">Чужой товар под реализацию · комиссия и долг владельцу считаются отдельно</p>
        </div>
        {canPayout && chosen.length > 0 && (
          <button type="button" onClick={makePayout} disabled={busy === 'payout'} className="rounded-btn bg-lime px-4 py-2 text-sm font-bold text-lime-ink disabled:opacity-50">
            Выплата · {som(chosenTotal)}
          </button>
        )}
      </div>

      <div className="grid gap-4 px-4 xl:grid-cols-[340px_1fr]">
        <div className="space-y-2 border-r border-surface-3 pr-4 max-xl:border-r-0 max-xl:pr-0">
          <select aria-label="Тип комиссионного учёта" value={form.mode} onChange={(event) => { const mode = event.target.value; setForm({ ...form, mode, productId: products.find((product) => product.trackingMode === mode)?.id || '' }); }} className={inputClass}><option value="serialized">Серийный · IMEI</option><option value="quantity">Количественная партия</option></select>
          <select aria-label="Комиссионный товар" value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} className={inputClass}>
            {products.filter((product) => product.trackingMode === form.mode).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">{form.mode === 'serialized' ? <input aria-label="IMEI комиссионного товара" value={form.imei} onChange={(event) => setForm({ ...form, imei: event.target.value })} placeholder="IMEI / SN" className={inputClass} /> : <input aria-label="Количество в комиссионной партии" inputMode="numeric" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value.replace(/\D/g, '') })} placeholder="Количество" className={inputClass} />}<input aria-label="Склад комиссионного товара" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Склад" className={inputClass} /></div>
          <input aria-label="Владелец комиссионного товара" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} placeholder="Владелец" className={inputClass} />
          <input aria-label="Контакт владельца" value={form.ownerContact} onChange={(event) => setForm({ ...form, ownerContact: event.target.value })} placeholder="Телефон / реквизиты" className={inputClass} />
          <div className="grid grid-cols-2 gap-2"><input aria-label="Комиссия, процент" inputMode="decimal" value={form.commissionPct} onChange={(event) => setForm({ ...form, commissionPct: event.target.value.replace(/[^\d.]/g, '') })} placeholder="Комиссия, %" className={inputClass} />{form.mode === 'serialized' && <select aria-label="Грейд комиссионного товара" value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} className={inputClass}><option>A</option><option>B</option><option>C</option></select>}</div>
          <button type="button" onClick={submitReceive} disabled={busy === 'receive'} className="w-full rounded-btn bg-coral px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Принять на комиссию</button>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[28px_1.5fr_1fr_.7fr_.8fr] gap-3 border-b border-surface-3 pb-2 text-[11px] text-subtle"><span /><span>Товар</span><span>Владелец</span><span>Комиссия</span><span>Статус</span></div>
            {items.length === 0 && <p className="py-8 text-center text-sm text-subtle">Комиссионных товаров пока нет</p>}
            {items.map((item) => {
              const canSelect = canPayout && settleable.some((row) => row.id === item.id);
              return <div key={item.id} className="grid grid-cols-[28px_1.5fr_1fr_.7fr_.8fr] items-center gap-3 border-b border-surface py-3 text-xs">
                <input aria-label={`Выбрать ${item.product.name}`} type="checkbox" disabled={!canSelect} checked={selected.includes(item.id)} onChange={() => toggle(item)} className="h-4 w-4 accent-lime" />
                <span className="min-w-0"><span className="block truncate font-semibold text-white">{item.product.name}</span><span className="font-mono text-[11px] text-subtle">{item.unit.imei}</span></span>
                <span className="truncate text-muted">{item.ownerName}</span>
                <span className="font-mono text-lime">{item.commissionBps / 100}%{item.commissionAmount != null ? ` · ${som(item.commissionAmount)}` : ''}</span>
                <span className={item.status === 'active' ? 'text-lime' : item.status === 'settled' ? 'text-info' : 'text-warn'}>{statusLabel[item.status]}{item.ownerAmount != null ? ` · ${som(item.ownerAmount)}` : ''}</span>
              </div>;
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-surface-3 px-4 pt-4"><h3 className="mb-2 text-xs font-bold uppercase text-subtle">Количественные партии</h3>{quantityLots.length === 0 ? <p className="text-sm text-subtle">Количественных партий пока нет</p> : <div className="overflow-x-auto"><div className="min-w-[720px]">{quantityLots.map((lot) => <div key={lot.id} className="border-b border-surface-3 py-3 text-xs"><div className="grid grid-cols-[1.5fr_1fr_.7fr_.8fr] gap-3"><span className="font-semibold text-white">{lot.product.name} · {lot.product.sku}</span><span className="text-muted">{lot.ownerName}</span><span className="font-mono text-lime">{lot.availableQty} свободно · {lot.reservedQty} резерв</span><span className="text-muted">{lot.location} · {lot.commissionBps / 100}%</span></div>{lot.allocations.filter((allocation) => allocation.status === 'sold' && allocation.saleOrder?.status === 'completed' && !allocation.payout).map((allocation) => <div key={allocation.id} className="mt-2 flex items-center justify-end gap-3"><span className="text-warn">Продано {allocation.qty} · владельцу {som(allocation.ownerAmount ?? 0)}</span>{canPayout && <button type="button" onClick={() => makeQuantityPayout(allocation.id, lot.ownerName, allocation.ownerAmount ?? 0)} disabled={busy === allocation.id} className="font-bold text-coral">Создать выплату</button>}</div>)}</div>)}</div></div>}</div>

      {canPayout && payouts.length > 0 && <div className="mt-5 border-t border-surface-3 px-4 pt-4"><h3 className="mb-2 text-xs font-bold uppercase text-subtle">Выплаты владельцам</h3><div className="flex flex-wrap gap-2">{payouts.map((payout) => <div key={payout.id} className="flex items-center gap-3 rounded-btn border border-surface-3 px-3 py-2 text-xs"><span className="text-white">{payout.ownerName}</span><span className="font-mono text-lime">{som(payout.ownerAmount)}</span>{payout.status === 'created' ? <button type="button" onClick={() => markPaid(payout)} disabled={busy === payout.id} className="font-bold text-coral">Провести</button> : <span className={payout.status === 'paid' ? 'text-info' : 'text-subtle'}>{payout.status === 'paid' ? 'Выплачено' : 'Отменено возвратом'}</span>}</div>)}</div></div>}
      {canPayout && adjustments.length > 0 && <div className="mt-4 border-t border-surface-3 px-4 pt-4"><h3 className="mb-2 text-xs font-bold uppercase text-coral">Компенсации после возврата</h3><div className="flex flex-wrap gap-2">{adjustments.map((adjustment) => <div key={adjustment.id} className="rounded-btn border border-coral/35 px-3 py-2 text-xs"><span className="text-white">{adjustment.ownerName}</span><span className="ml-3 font-mono text-coral">{som(adjustment.amount)}</span><span className="ml-3 text-muted">{adjustment.status === 'open' ? 'к взысканию/зачёту' : 'закрыто'}</span></div>)}</div></div>}
      {message && <p role="status" className="mx-4 mt-3 rounded-btn bg-surface-2 px-3 py-2 text-sm text-lime">{message}</p>}
    </section>
  );
}

const inputClass = 'w-full min-w-0 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral';
const statusLabel: Record<ConsignmentItem['status'], string> = { active: 'В продаже', sold: 'Начислено', settled: 'Выплачено', withdrawn: 'Снято' };
