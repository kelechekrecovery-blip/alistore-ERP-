'use client';

import { useEffect, useState } from 'react';
import { fetchCatalog, inventoryCount, receiveInventoryBatch, receiveQuantityInventory, transferUnit, uploadEvidenceImages, type CatalogProduct } from '@/lib/api';
import { EvidencePicker } from './EvidencePicker';

/** Transfer + inventory-count operations for the warehouse console. */
export function WarehouseOps({ accessToken, actor }: { accessToken: string; actor: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [imei, setImei] = useState('');
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
  const [transferFiles, setTransferFiles] = useState<File[]>([]);
  const [countFiles, setCountFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => {
      setProducts(c.items);
      if (c.items[0]) {
        setProductId(c.items[0].id);
        setReceiveProductId(c.items[0].id);
      }
    });
  }, []);

  function flash(m: string) {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2500);
  }

  async function doTransfer() {
    if (!imei.trim() || !dest.trim()) return;
    setBusy('transfer');
    try {
      const r = await transferUnit(imei.trim(), dest.trim(), accessToken);
      const evidence = transferFiles.length
        ? await uploadEvidenceImages({
            files: transferFiles,
            entityType: 'inventory',
            entityId: r.movementId,
            label: 'transfer_photo',
            actor,
            accessToken,
          })
        : [];
      flash(`✓ ${r.imei}: ${r.from} → ${r.to} · фото ${evidence.length}`);
      setImei('');
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

  return (
    <div className="mb-4 rounded-card border border-[#2E2822] bg-[#1A1611] p-4 ">
      <div className="mb-3 font-display text-sm font-bold text-white">Операции склада</div>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* receive */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">Приёмка партии</p>
          <div className="flex flex-col gap-2">
            <select value={receiveProductId} onChange={(e) => setReceiveProductId(e.target.value)} className="rounded-btn border border-[#2E2822] bg-[#1A1611] px-3 py-2 text-sm outline-none focus:border-coral">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.trackingMode === 'quantity' ? 'количество' : 'IMEI'}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={receiveLocation} onChange={(e) => setReceiveLocation(e.target.value)} placeholder="склад" className="min-w-0 flex-1 rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-coral" />
              <select disabled={products.find((product) => product.id === receiveProductId)?.trackingMode === 'quantity'} value={receiveGrade} onChange={(e) => setReceiveGrade(e.target.value)} className="w-20 rounded-btn border border-[#2E2822] bg-[#1A1611] px-2 py-2 text-sm outline-none focus:border-coral disabled:text-[#6E645C]">
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
            {products.find((product) => product.id === receiveProductId)?.trackingMode === 'quantity' ? (
              <input value={receiveQuantity} onChange={(e) => setReceiveQuantity(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Количество, шт." className="rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-coral" />
            ) : (
              <textarea
                value={receiveImeis}
                onChange={(e) => setReceiveImeis(e.target.value)}
                placeholder="IMEI / SN, каждый с новой строки"
                className="min-h-[86px] resize-none rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-[#6E645C] focus:border-coral"
              />
            )}
            <button type="button" disabled={busy === 'receive'} onClick={doReceive} className="rounded-btn bg-lime px-4 py-2 text-sm font-semibold text-lime-ink transition hover:bg-lime-dark disabled:bg-[#2E2822]">Принять</button>
          </div>
        </div>
        {/* transfer */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">Перемещение по IMEI</p>
          <div className="flex flex-col gap-2">
            <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI единицы" className="rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-coral" />
            <div className="flex gap-2">
              <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="куда (склад)" className="flex-1 rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-coral" />
              <button type="button" disabled={busy === 'transfer'} onClick={doTransfer} className="rounded-btn bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-deep disabled:bg-[#2E2822]">Переместить</button>
            </div>
            <EvidencePicker files={transferFiles} onChange={setTransferFiles} label="Фото перемещения" hint="Коробка, IMEI или полка" max={3} />
          </div>
        </div>
        {/* count */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8A7F76]">Инвентаризация</p>
          <div className="flex flex-col gap-2">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="rounded-btn border border-[#2E2822] bg-[#1A1611] px-3 py-2 text-sm outline-none focus:border-coral">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="склад" className="w-28 rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-coral" />
              <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ''))} placeholder="факт" inputMode="numeric" className="w-20 rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-coral" />
              <button type="button" disabled={busy === 'count'} onClick={doCount} className="flex-1 rounded-btn bg-lime px-4 py-2 text-sm font-semibold text-lime-ink transition hover:bg-lime-dark disabled:bg-[#2E2822]">Записать</button>
            </div>
            <textarea
              value={countScans}
              onChange={(e) => setCountScans(e.target.value)}
              placeholder="Скан IMEI/SN, каждый с новой строки"
              className="min-h-[72px] resize-none rounded-btn border border-[#2E2822] bg-[#221E19] px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-[#6E645C] focus:border-coral"
            />
            <div className="flex items-center gap-2 text-xs text-[#8A7F76]">
              <span>Сканов: {parseImeis(countScans).length}</span>
              <button type="button" onClick={() => setCounted(String(parseImeis(countScans).length))} className="ml-auto font-semibold text-lime hover:text-white">
                Факт = сканы
              </button>
            </div>
            <EvidencePicker files={countFiles} onChange={setCountFiles} label="Фото полки" hint="Общий вид и спорные позиции" max={4} />
          </div>
        </div>
      </div>
      {msg && <div className="mt-3 rounded-btn bg-[#221E19] px-3 py-2 text-sm text-lime">{msg}</div>}
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
