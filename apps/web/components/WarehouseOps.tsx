'use client';

import { useEffect, useState } from 'react';
import { fetchCatalog, inventoryCount, transferUnit, uploadEvidenceImages, type CatalogProduct } from '@/lib/api';
import { EvidencePicker } from './EvidencePicker';

/** Transfer + inventory-count operations for the warehouse console. */
export function WarehouseOps() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [imei, setImei] = useState('');
  const [dest, setDest] = useState('BISHKEK-2');
  const [productId, setProductId] = useState('');
  const [location, setLocation] = useState('BISHKEK-1');
  const [counted, setCounted] = useState('');
  const [transferFiles, setTransferFiles] = useState<File[]>([]);
  const [countFiles, setCountFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog({ limit: 100 }).then((c) => {
      setProducts(c.items);
      if (c.items[0]) setProductId(c.items[0].id);
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
      const r = await transferUnit(imei.trim(), dest.trim());
      const evidence = transferFiles.length
        ? await uploadEvidenceImages({
            files: transferFiles,
            entityType: 'inventory',
            entityId: r.movementId,
            label: 'transfer_photo',
            actor: 'warehouse',
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
    if (!productId || !location.trim() || counted === '') return;
    setBusy('count');
    try {
      const r = await inventoryCount(productId, location.trim(), Number(counted));
      const evidence = countFiles.length
        ? await uploadEvidenceImages({
            files: countFiles,
            entityType: 'inventory',
            entityId: r.movementId,
            label: 'count_photo',
            actor: 'warehouse',
          })
        : [];
      flash(`✓ Учтено ${r.counted}, было ${r.expected}, расхождение ${r.diff} · фото ${evidence.length}`);
      setCounted('');
      setCountFiles([]);
    } catch (e) {
      flash(e instanceof Error ? errMsg(e) : 'Ошибка учёта');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 rounded-card border border-[#2E2822] bg-[#1A1611] p-4 ">
      <div className="mb-3 font-display text-sm font-bold text-white">Операции склада</div>
      <div className="grid gap-4 sm:grid-cols-2">
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
            <EvidencePicker files={countFiles} onChange={setCountFiles} label="Фото полки" hint="Общий вид и спорные позиции" max={4} />
          </div>
        </div>
      </div>
      {msg && <div className="mt-3 rounded-btn bg-[#221E19] px-3 py-2 text-sm text-lime">{msg}</div>}
    </div>
  );
}

function errMsg(e: Error): string {
  return e.message.includes('409') ? 'Единицу нельзя переместить (не в наличии)' : e.message.includes('422') ? 'Проверьте данные' : 'Ошибка';
}
