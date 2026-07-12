'use client';

import { Check, PackageCheck, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  fetchAdminProducts,
  fetchPurchaseOrders,
  fetchSuppliers,
  receivePurchaseOrder,
  sendPurchaseOrder,
  type AdminProduct,
  type PurchaseOrder,
  type SupplierSummary,
} from '@/lib/api';
import { som } from '@/lib/format';

type DraftLine = { productId: string; qty: string; unitCost: string };
const emptyLine = (): DraftLine => ({ productId: '', qty: '1', unitCost: '' });
const requestKey = (kind: string) => `${kind}-${Date.now()}-${crypto.randomUUID()}`;

const STATUS_META: Record<PurchaseOrder['status'], { label: string; color: string }> = {
  draft: { label: 'Черновик', color: '#8A7F76' },
  sent: { label: 'Отправлен', color: '#7DB8FF' },
  receiving: { label: 'Приёмка', color: '#E5B23C' },
  received: { label: 'Принят', color: '#C6FF3D' },
  cancelled: { label: 'Отменён', color: '#FF8A7A' },
};

const inputClass = 'h-10 w-full rounded-[8px] border border-[#2E2822] bg-[#16130F] px-3 text-sm text-white outline-none focus:border-[#6E645C]';

export function ProcurementView({ accessToken }: { accessToken: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [form, setForm] = useState({ idempotencyKey: requestKey('erp-po'), supplierId: '', location: 'BISHKEK-1', note: '', items: [emptyLine()] });
  const [receive, setReceive] = useState({ idempotencyKey: requestKey('erp-receipt'), orderId: '', itemId: '', grade: 'A' as 'A' | 'B' | 'C', imeis: '' });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [nextOrders, nextSuppliers, nextProducts] = await Promise.allSettled([
      fetchPurchaseOrders(accessToken),
      fetchSuppliers(accessToken),
      fetchAdminProducts({ limit: 100 }, accessToken),
    ]);
    if (nextOrders.status === 'rejected') throw nextOrders.reason;
    const supplierRows = nextSuppliers.status === 'fulfilled' ? nextSuppliers.value : [];
    setOrders(nextOrders.value);
    setSuppliers(supplierRows);
    setProducts(nextProducts.status === 'fulfilled' ? nextProducts.value.items : []);
    setForm((current) => ({ ...current, supplierId: current.supplierId || supplierRows[0]?.id || '' }));
  }, [accessToken]);

  useEffect(() => {
    refresh().catch(() => setError('Не удалось загрузить Purchase Orders'));
  }, [refresh]);

  const receivableOrders = useMemo(() => orders.filter((order) => order.status === 'sent' || order.status === 'receiving'), [orders]);
  const selectedOrder = receivableOrders.find((order) => order.id === receive.orderId) ?? receivableOrders[0];
  const openItems = selectedOrder?.items.filter((item) => item.receivedQty < item.orderedQty) ?? [];
  const selectedItem = openItems.find((item) => item.id === receive.itemId) ?? openItems[0];
  const canCreate = suppliers.length > 0 && products.length > 0;

  async function run(key: string, action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      await action();
      await refresh();
      setMessage(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Операция не выполнена');
      return false;
    } finally {
      setBusy('');
    }
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  }

  async function submitOrder() {
    const items = form.items.map((line) => ({ productId: line.productId, qty: Number(line.qty), unitCost: Number(line.unitCost) }));
    if (!form.supplierId || items.some((item) => !item.productId || item.qty < 1 || item.unitCost < 0)) {
      setError('Заполните поставщика и все строки PO');
      return;
    }
    const created = await run('create', () => createPurchaseOrder({ ...form, items }, accessToken), 'Purchase Order создан');
    if (created) {
      setForm((current) => ({ ...current, idempotencyKey: requestKey('erp-po'), note: '', items: [emptyLine()] }));
    }
  }

  async function submitReceipt() {
    if (!selectedOrder || !selectedItem) {
      setError('Нет PO, готового к приёмке');
      return;
    }
    const imeis = [...new Set(receive.imeis.split(/\s+/).map((value) => value.trim()).filter(Boolean))];
    if (!imeis.length) {
      setError('Отсканируйте хотя бы один IMEI/SN');
      return;
    }
    const received = await run(
      'receive',
      () => receivePurchaseOrder(
        selectedOrder.id,
        { idempotencyKey: receive.idempotencyKey, lines: [{ itemId: selectedItem.id, imeis, grade: receive.grade }] },
        accessToken,
      ),
      `Принято устройств: ${imeis.length}`,
    );
    if (received) {
      setReceive((current) => ({ ...current, idempotencyKey: requestKey('erp-receipt'), imeis: '' }));
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Purchase Orders</h2>
          <p className="mt-0.5 text-xs text-[#8A7F76]">Поставщик → отправка → скан-приёмка → склад и Event Ledger</p>
        </div>
        <button type="button" title="Обновить" onClick={() => refresh()} className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#2E2822] text-[#A79C92] hover:text-white">
          <RefreshCw size={15} />
        </button>
      </div>

      {(message || error) && (
        <div className={`rounded-[8px] border px-3 py-2 text-sm ${error ? 'border-[#FF8A7A]/40 bg-[#FF8A7A]/10 text-[#FF8A7A]' : 'border-lime/30 bg-lime/10 text-lime'}`}>
          {error || message}
        </div>
      )}

      {canCreate && <section className="border border-[#2E2822] bg-[#1A1611] p-4">
        <div className="mb-3 text-sm font-semibold">Новый PO</div>
        <div className="grid gap-3 md:grid-cols-2">
          <select aria-label="Поставщик PO" value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} className={inputClass}>
            <option value="">Поставщик</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
          <input aria-label="Склад назначения" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} className={inputClass} placeholder="Склад назначения" />
        </div>
        <div className="mt-3 space-y-2">
          {form.items.map((line, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_90px_130px_40px]">
              <select aria-label={`Товар PO ${index + 1}`} value={line.productId} onChange={(event) => {
                const product = products.find((item) => item.id === event.target.value);
                updateLine(index, { productId: event.target.value, unitCost: product ? String(product.cost) : '' });
              }} className={inputClass}>
                <option value="">Товар</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
              </select>
              <input aria-label={`Количество PO ${index + 1}`} type="number" min="1" value={line.qty} onChange={(event) => updateLine(index, { qty: event.target.value })} className={inputClass} />
              <input aria-label={`Закупочная цена PO ${index + 1}`} type="number" min="0" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} className={inputClass} placeholder="Цена" />
              <button type="button" title="Удалить строку" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#2E2822] text-[#8A7F76] hover:text-[#FF8A7A] disabled:opacity-30">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <input aria-label="Комментарий PO" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} className={`${inputClass} mt-3`} placeholder="Комментарий" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyLine()] }))} className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#2E2822] px-3 text-xs font-semibold text-[#D8CFC6]">
            <Plus size={14} /> Строка
          </button>
          <button type="button" disabled={busy === 'create'} onClick={submitOrder} className="ml-auto inline-flex h-9 items-center gap-2 rounded-[8px] bg-lime px-4 text-xs font-bold text-[#111] disabled:opacity-50">
            <Check size={14} /> Создать PO
          </button>
        </div>
      </section>}

      <section className="overflow-hidden border border-[#2E2822] bg-[#1A1611]">
        <div className="grid grid-cols-[120px_1fr_110px_100px] gap-3 border-b border-[#2E2822] bg-[#16130F] px-4 py-2 text-[10px] uppercase text-[#8A7F76]">
          <span>PO</span><span>Поставщик · товары</span><span>Сумма</span><span className="text-right">Статус</span>
        </div>
        {orders.length === 0 && <div className="px-4 py-7 text-center text-sm text-[#6E645C]">Purchase Orders пока нет</div>}
        {orders.map((order) => {
          const total = order.items.reduce((sum, item) => sum + item.orderedQty * item.unitCost, 0);
          const meta = STATUS_META[order.status];
          return (
            <div key={order.id} className="grid grid-cols-[120px_1fr_110px_100px] items-center gap-3 border-b border-[#221E19] px-4 py-3 last:border-0">
              <div className="font-mono text-xs text-white">{order.number}</div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white">{order.supplier.name} · {order.location}</div>
                <div className="mt-0.5 truncate text-[11px] text-[#8A7F76]">{order.items.map((item) => `${item.product.sku} ${item.receivedQty}/${item.orderedQty}`).join(' · ')}</div>
              </div>
              <div className="font-mono text-xs text-[#D8CFC6]">{som(total)}</div>
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                {order.status === 'draft' && <button type="button" title="Отправить PO" disabled={busy === order.id} onClick={() => run(order.id, () => sendPurchaseOrder(order.id, accessToken), `${order.number} отправлен`)} className="grid h-7 w-7 place-items-center rounded-[6px] border border-[#2E2822] text-[#A79C92] hover:text-white"><Send size={13} /></button>}
                {(order.status === 'draft' || order.status === 'sent') && <button type="button" title="Отменить PO" disabled={busy === order.id} onClick={() => run(order.id, () => cancelPurchaseOrder(order.id, accessToken), `${order.number} отменён`)} className="grid h-7 w-7 place-items-center rounded-[6px] border border-[#2E2822] text-[#A79C92] hover:text-[#FF8A7A]"><X size={13} /></button>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="border border-[#2E2822] bg-[#1A1611] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><PackageCheck size={16} /> Приёмка по PO</div>
        <div className="grid gap-3 md:grid-cols-3">
          <select aria-label="PO для приёмки" value={selectedOrder?.id ?? ''} onChange={(event) => setReceive((current) => ({ ...current, orderId: event.target.value, itemId: '' }))} className={inputClass}>
            <option value="">Выберите PO</option>
            {receivableOrders.map((order) => <option key={order.id} value={order.id}>{order.number} · {order.supplier.name}</option>)}
          </select>
          <select aria-label="Строка PO для приёмки" value={selectedItem?.id ?? ''} onChange={(event) => setReceive((current) => ({ ...current, itemId: event.target.value }))} className={inputClass}>
            <option value="">Строка товара</option>
            {openItems.map((item) => <option key={item.id} value={item.id}>{item.product.sku} · {item.receivedQty}/{item.orderedQty}</option>)}
          </select>
          <select aria-label="Грейд приёмки" value={receive.grade} onChange={(event) => setReceive((current) => ({ ...current, grade: event.target.value as 'A' | 'B' | 'C' }))} className={inputClass}>
            <option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option>
          </select>
        </div>
        <textarea aria-label="IMEI для приёмки" value={receive.imeis} onChange={(event) => setReceive((current) => ({ ...current, imeis: event.target.value }))} rows={4} className="mt-3 w-full resize-y rounded-[8px] border border-[#2E2822] bg-[#16130F] p-3 font-mono text-xs text-white outline-none focus:border-[#6E645C]" placeholder="Сканируйте IMEI/SN — по одному в строке" />
        <button type="button" disabled={busy === 'receive' || !selectedItem} onClick={submitReceipt} className="mt-3 inline-flex h-9 items-center gap-2 rounded-[8px] bg-white px-4 text-xs font-bold text-[#111] disabled:opacity-40">
          <PackageCheck size={14} /> Принять на склад
        </button>
      </section>
    </div>
  );
}
