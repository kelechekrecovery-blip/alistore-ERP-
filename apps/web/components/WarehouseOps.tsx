'use client';

import { useEffect, useState } from 'react';
import { fetchCatalog, inventoryCount, printServerSvgLabels, receiveInventoryBatch, receiveQuantityInventory, renderImeiLabel, requestInventoryMovement, transferQuantityInventory, transferUnit, uploadEvidenceImages, type CatalogProduct } from '@/lib/api';
import { EvidencePicker } from './EvidencePicker';

/** Transfer + inventory-count operations for the warehouse console. */
export function WarehouseOps({ accessToken, actor }: { accessToken: string; actor: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [imei, setImei] = useState('');
  const [transferProductId, setTransferProductId] = useState('');
  const [transferFrom, setTransferFrom] = useState('BISHKEK-1');
  const [transferQty, setTransferQty] = useState('');
  const [dest, setDest] = useState('BISHKEK-2');
  const [productId, setProductId] = useState('');
  const [location, setLocation] = useState('BISHKEK-1');
  const [counted, setCounted] = useState('');
  const [countScans, setCountScans] = useState('');
  const [receiveProductId, setReceiveProductId] = useState('');
  const [receiveLocation, setReceiveLocation] = useState('BISHKEK-1');
  const [receiveGrade, setReceiveGrade] = useState('A');
  const [receiveImeis, setReceiveImeis] = useState('');
  const [receiveQuantity, setReceiveQuantity] = useState('');
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustLocation, setAdjustLocation] = useState('BISHKEK-1');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'write_off' | 'adjust'>('write_off');
  const [adjustDirection, setAdjustDirection] = useState<'increase' | 'decrease'>('decrease');
  const [adjustReason, setAdjustReason] = useState('');
  const [transferFiles, setTransferFiles] = useState<File[]>([]);
  const [countFiles, setCountFiles] = useState<File[]>([]);
  const [receivedImeis, setReceivedImeis] = useState<string[]>([]);
  const [labelsBusy, setLabelsBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => {
      setProducts(c.items);
      if (c.items[0]) {
        setProductId(c.items[0].id);
        setReceiveProductId(c.items[0].id);
        setTransferProductId(c.items[0].id);
        setAdjustProductId(c.items.find((product) => product.trackingMode === 'quantity')?.id ?? c.items[0].id);
      }
    });
  }, []);

  function flash(m: string) {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2500);
  }

  async function doTransfer() {
    const selected = products.find((product) => product.id === transferProductId);
    const quantity = Number(transferQty);
    if (!selected || !dest.trim()) return;
    if (selected.trackingMode === 'quantity'
      ? !transferFrom.trim() || !Number.isInteger(quantity) || quantity < 1
      : !imei.trim()) return;
    setBusy('transfer');
    try {
      let movementId: string;
      let success: string;
      if (selected.trackingMode === 'quantity') {
        const result = await transferQuantityInventory({
            idempotencyKey: crypto.randomUUID(),
            productId: selected.id,
            from: transferFrom.trim(),
            to: dest.trim(),
            qty: quantity,
          }, accessToken);
        movementId = result.movementId;
        success = `✓ ${result.qty} шт: ${result.from} → ${result.to}`;
      } else {
        const result = await transferUnit(imei.trim(), dest.trim(), accessToken);
        movementId = result.movementId;
        success = `✓ ${result.imei}: ${result.from} → ${result.to}`;
      }
      const evidence = transferFiles.length
        ? await uploadEvidenceImages({
            files: transferFiles,
            entityType: 'inventory',
            entityId: movementId,
            label: 'transfer_photo',
            actor,
            accessToken,
          })
        : [];
      flash(`${success} · фото ${evidence.length}`);
      setImei('');
      setTransferQty('');
      setTransferFiles([]);
    } catch (e) {
      flash(e instanceof Error ? errMsg(e) : 'Ошибка перемещения');
    } finally {
      setBusy(null);
    }
  }

  async function doCount() {
    const scannedImeis = parseImeis(countScans);
    const effectiveCounted = counted === '' ? scannedImeis.length : Number(counted);
    if (!productId || !location.trim() || (counted === '' && scannedImeis.length === 0)) return;
    setBusy('count');
    try {
      const r = await inventoryCount(productId, location.trim(), effectiveCounted, accessToken);
      const evidence = countFiles.length
        ? await uploadEvidenceImages({
            files: countFiles,
            entityType: 'inventory',
            entityId: r.movementId,
            label: 'count_photo',
            actor,
            accessToken,
          })
        : [];
      flash(`✓ Учтено ${r.counted}, было ${r.expected}, расхождение ${r.diff} · сканов ${scannedImeis.length} · фото ${evidence.length}`);
      setCounted('');
      setCountScans('');
      setCountFiles([]);
    } catch (e) {
      flash(e instanceof Error ? errMsg(e) : 'Ошибка учёта');
    } finally {
      setBusy(null);
    }
  }

  async function doReceive() {
    const selected = products.find((product) => product.id === receiveProductId);
    const imeis = parseImeis(receiveImeis);
    const quantity = Number(receiveQuantity);
    if (!selected || !receiveLocation.trim()) return;
    if (selected.trackingMode === 'quantity' ? !Number.isInteger(quantity) || quantity < 1 : imeis.length === 0) return;
    setBusy('receive');
    try {
      const r = selected.trackingMode === 'quantity'
        ? await receiveQuantityInventory(selected.id, receiveLocation.trim(), quantity, accessToken)
        : await receiveInventoryBatch(selected.id, receiveLocation.trim(), imeis, accessToken, receiveGrade);
      flash(`✓ Принято ${r.received} шт · ${r.location}`);
      setReceivedImeis(selected.trackingMode === 'quantity' ? [] : imeis);
      setReceiveImeis('');
      setReceiveQuantity('');
      const refreshed = await fetchCatalog({ limit: 100 });
      setProducts(refreshed.items);
    } catch (e) {
      flash(e instanceof Error ? errMsg(e) : 'Ошибка приёмки');
    } finally {
      setBusy(null);
    }
  }

  /** Print one Code128 sticker per IMEI of the last received batch (labels/imei). */
  async function printReceivedLabels() {
    if (receivedImeis.length === 0) return;
    setLabelsBusy(true);
    try {
      const labels = await Promise.all(receivedImeis.map((value) => renderImeiLabel(value, accessToken)));
      printServerSvgLabels(labels.map((label) => label.svg), `Этикетки приёмки (${labels.length})`);
    } catch (e) {
      flash(e instanceof Error ? errMsg(e) : 'Ошибка печати этикеток');
    } finally {
      setLabelsBusy(false);
    }
  }

  async function requestAdjustment() {
    const quantity = Number(adjustQty);
    if (!adjustProductId || !adjustLocation.trim() || !adjustReason.trim() || !Number.isInteger(quantity) || quantity < 1) return;
    setBusy('adjust');
    try {
      const result = await requestInventoryMovement({
        productId: adjustProductId,
        location: adjustLocation.trim(),
        qty: quantity,
        type: adjustType,
        direction: adjustType === 'adjust' ? adjustDirection : undefined,
        reason: adjustReason.trim(),
      }, accessToken);
      flash(`✓ Заявка ${result.approvalId.slice(-8)} отправлена владельцу`);
      setAdjustQty('');
      setAdjustReason('');
    } catch (e) {
      flash(e instanceof Error ? errMsg(e) : 'Ошибка заявки');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 rounded-card border border-surface-3 bg-surface p-4 ">
      <div className="mb-3 font-display text-sm font-bold text-white">Операции склада</div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {/* receive */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Приёмка партии</p>
          <div className="flex flex-col gap-2">
            <select value={receiveProductId} onChange={(e) => setReceiveProductId(e.target.value)} className="rounded-btn border border-surface-3 bg-surface px-3 py-2 text-sm outline-none focus:border-coral">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.trackingMode === 'quantity' ? 'количество' : 'IMEI'}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={receiveLocation} onChange={(e) => setReceiveLocation(e.target.value)} placeholder="склад" className="min-w-0 flex-1 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
              <select disabled={products.find((product) => product.id === receiveProductId)?.trackingMode === 'quantity'} value={receiveGrade} onChange={(e) => setReceiveGrade(e.target.value)} className="w-20 rounded-btn border border-surface-3 bg-surface px-2 py-2 text-sm outline-none focus:border-coral disabled:text-faint">
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
            {products.find((product) => product.id === receiveProductId)?.trackingMode === 'quantity' ? (
              <input value={receiveQuantity} onChange={(e) => setReceiveQuantity(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Количество, шт." className="rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
            ) : (
              <textarea
                value={receiveImeis}
                onChange={(e) => setReceiveImeis(e.target.value)}
                placeholder="IMEI / SN, каждый с новой строки"
                className="min-h-[86px] resize-none rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-faint focus:border-coral"
              />
            )}
            <button type="button" disabled={busy === 'receive'} onClick={doReceive} className="rounded-btn bg-lime px-4 py-2 text-sm font-semibold text-lime-ink transition hover:bg-lime-dark disabled:bg-surface-3">Принять</button>
            {receivedImeis.length > 0 && (
              <button
                type="button"
                disabled={labelsBusy}
                onClick={printReceivedLabels}
                className="rounded-btn border border-surface-3 bg-surface-2 px-4 py-2 text-sm font-semibold text-bright transition hover:border-lime disabled:opacity-50"
              >
                {labelsBusy ? '…' : `⎙ Печать этикеток (${receivedImeis.length})`}
              </button>
            )}
          </div>
        </div>
        {/* transfer */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Перемещение</p>
          <div className="flex flex-col gap-2">
            <select aria-label="Товар для перемещения" value={transferProductId} onChange={(e) => setTransferProductId(e.target.value)} className="rounded-btn border border-surface-3 bg-surface px-3 py-2 text-sm outline-none focus:border-coral">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.trackingMode === 'quantity' ? 'количество' : 'IMEI'}</option>)}
            </select>
            {products.find((product) => product.id === transferProductId)?.trackingMode === 'quantity' ? (
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="Склад отправления" value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} placeholder="откуда" className="min-w-0 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
                <input aria-label="Количество для перемещения" value={transferQty} onChange={(e) => setTransferQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="количество" className="min-w-0 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
              </div>
            ) : (
              <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI единицы" className="rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
            )}
            <div className="flex gap-2">
              <input aria-label="Склад назначения" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="куда (склад)" className="flex-1 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
              <button type="button" disabled={busy === 'transfer'} onClick={doTransfer} className="rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-surface-3">Переместить</button>
            </div>
            <EvidencePicker files={transferFiles} onChange={setTransferFiles} label="Фото перемещения" hint="Коробка, IMEI или полка" max={3} />
          </div>
        </div>
        {/* adjustment */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Списание и корректировка</p>
          <div className="flex flex-col gap-2">
            <select aria-label="Товар для корректировки" value={adjustProductId} onChange={(e) => setAdjustProductId(e.target.value)} className="rounded-btn border border-surface-3 bg-surface px-3 py-2 text-sm outline-none focus:border-coral">
              {products.filter((product) => product.trackingMode === 'quantity').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Тип корректировки" value={adjustType} onChange={(e) => setAdjustType(e.target.value as 'write_off' | 'adjust')} className="min-w-0 rounded-btn border border-surface-3 bg-surface px-2 py-2 text-sm outline-none focus:border-coral">
                <option value="write_off">Списание</option>
                <option value="adjust">Корректировка</option>
              </select>
              <select aria-label="Направление корректировки" disabled={adjustType === 'write_off'} value={adjustDirection} onChange={(e) => setAdjustDirection(e.target.value as 'increase' | 'decrease')} className="min-w-0 rounded-btn border border-surface-3 bg-surface px-2 py-2 text-sm outline-none focus:border-coral disabled:text-faint">
                <option value="decrease">Уменьшить</option>
                <option value="increase">Увеличить</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Склад корректировки" value={adjustLocation} onChange={(e) => setAdjustLocation(e.target.value)} placeholder="склад" className="min-w-0 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
              <input aria-label="Количество корректировки" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="количество" className="min-w-0 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
            </div>
            <input aria-label="Причина корректировки" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="причина и основание" className="rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
            <button type="button" disabled={busy === 'adjust'} onClick={requestAdjustment} className="rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-surface-3">На согласование</button>
          </div>
        </div>
        {/* count */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Инвентаризация</p>
          <div className="flex flex-col gap-2">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-btn border border-surface-3 bg-surface px-3 py-2 text-sm outline-none focus:border-coral">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="склад" className="w-28 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
              <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ''))} placeholder="факт" inputMode="numeric" className="w-20 rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-white outline-none placeholder:text-faint focus:border-coral" />
              <button type="button" disabled={busy === 'count'} onClick={doCount} className="flex-1 rounded-btn bg-lime px-4 py-2 text-sm font-semibold text-lime-ink transition hover:bg-lime-dark disabled:bg-surface-3">Записать</button>
            </div>
            <textarea
              value={countScans}
              onChange={(e) => setCountScans(e.target.value)}
              placeholder="Скан IMEI/SN, каждый с новой строки"
              className="min-h-[72px] resize-none rounded-btn border border-surface-3 bg-surface-2 px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-faint focus:border-coral"
            />
            <div className="flex items-center gap-2 text-xs text-subtle">
              <span>Сканов: {parseImeis(countScans).length}</span>
              <button type="button" onClick={() => setCounted(String(parseImeis(countScans).length))} className="ml-auto font-semibold text-lime hover:text-white">
                Факт = сканы
              </button>
            </div>
            <EvidencePicker files={countFiles} onChange={setCountFiles} label="Фото полки" hint="Общий вид и спорные позиции" max={4} />
          </div>
        </div>
      </div>
      {msg && <div className="mt-3 rounded-btn bg-surface-2 px-3 py-2 text-sm text-lime">{msg}</div>}
    </div>
  );
}

function parseImeis(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,; ]+/).map((item) => item.trim()).filter(Boolean)));
}

function errMsg(e: Error): string {
  if (e.message.includes('imei_already_exists')) return 'IMEI уже есть в базе';
  return e.message.includes('409') ? 'Единицу нельзя переместить (не в наличии)' : e.message.includes('422') ? 'Проверьте данные' : 'Ошибка';
}
