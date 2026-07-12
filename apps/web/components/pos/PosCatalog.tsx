'use client';

import Image from 'next/image';
import { som } from '@/lib/format';
import { productImage } from '@/components/ProductCard';
import type { CatalogProduct, OfflinePosQueueItem } from '@/lib/api';

interface PosQueueSummary {
  pending: number;
  synced: number;
  failed: number;
  approval: number;
}

interface PosCatalogProps {
  cashier: string;
  shop: string;
  online: boolean;
  queueSummary: PosQueueSummary;
  scanCode: string;
  onScanCodeChange: (value: string) => void;
  onScan: (raw: string) => void;
  syncing: boolean;
  onSync: () => void;
  canPrint: boolean;
  onPrint: () => void;
  catalogSync: string;
  terminalMessage: string;
  queue: OfflinePosQueueItem[];
  onClearSynced: () => void;
  categories: string[];
  cat: string;
  onSelectCategory: (category: string) => void;
  grid: CatalogProduct[];
  onAdd: (product: CatalogProduct) => void;
  onLogoutStaff: () => void;
}

const QUEUE_STATUS_LABELS: Record<OfflinePosQueueItem['status'], string> = {
  queued: 'в очереди',
  syncing: 'синхронизация',
  synced: 'проведено',
  failed: 'конфликт',
  approval_required: 'одобрение',
};

/**
 * Left-hand catalog panel of the POS terminal: shift header, scan/sync/print bar with
 * the offline queue preview, category filter, and the tap-to-add product grid.
 * Presentational — catalog/scan/queue state and handlers live in the POS page.
 */
export function PosCatalog({
  cashier,
  shop,
  online,
  queueSummary,
  scanCode,
  onScanCodeChange,
  onScan,
  syncing,
  onSync,
  canPrint,
  onPrint,
  catalogSync,
  terminalMessage,
  queue,
  onClearSynced,
  categories,
  cat,
  onSelectCategory,
  grid,
  onAdd,
  onLogoutStaff,
}: PosCatalogProps) {
  return (
    <section data-testid="pos-catalog" className="flex min-w-0 flex-1 flex-col border-r border-[#2E2822]">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#2E2822] px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coral font-display text-lg font-extrabold text-white">
          A
        </span>
        <div>
          <div className="font-display text-base font-bold text-white">POS · Касса</div>
          <div className="text-xs text-[#8A7F76]">
            Смена · {cashier} · {shop}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogoutStaff}
          className="rounded-chip border border-[#2E2822] px-3 py-1.5 text-xs font-semibold text-[#8A7F76] transition hover:border-[#3A342E] hover:text-white"
        >
          Выйти staff
        </button>
        <span className={`ml-auto rounded-chip px-3 py-1.5 text-xs ${online ? 'bg-lime/10 text-lime' : 'bg-warn/15 text-warn'}`}>
          {online ? '● онлайн' : '○ offline'} · {queueSummary.pending} в очереди
        </span>
      </div>

      <div className="flex flex-shrink-0 flex-col gap-2 border-b border-[#2E2822] px-5 py-3">
        <div className="flex gap-2">
          <input
            value={scanCode}
            onChange={(e) => onScanCodeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onScan(scanCode);
            }}
            aria-label="Поиск или сканирование товара"
            placeholder="Поиск или скан штрихкода…"
            className="min-w-0 flex-1 rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6E645C] focus:border-lime"
          />
          <button type="button" onClick={() => onScan(scanCode)} className="rounded-[10px] bg-lime px-4 py-2 text-sm font-bold text-lime-ink">
            Скан
          </button>
          <button
            type="button"
            disabled={syncing || queueSummary.pending === 0}
            onClick={onSync}
            className="rounded-[10px] border border-[#2E2822] bg-[#221E19] px-4 py-2 text-sm font-bold text-[#D8CFC6] disabled:text-[#6E645C]"
          >
            {syncing ? 'Синк…' : `Синк ${queueSummary.pending}`}
          </button>
          <button
            type="button"
            disabled={!canPrint}
            onClick={onPrint}
            className="rounded-[10px] border border-[#2E2822] bg-[#221E19] px-4 py-2 text-sm font-bold text-[#D8CFC6] disabled:text-[#6E645C]"
          >
            Печать
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8A7F76]">
          <span>Сканер: keyboard-wedge</span>
          <span>Принтер: browser/thermal print</span>
          <span>{catalogSync}</span>
          <span>{terminalMessage}</span>
          {queueSummary.synced > 0 && (
            <button type="button" onClick={onClearSynced} className="text-lime hover:text-white">
              очистить synced ({queueSummary.synced})
            </button>
          )}
        </div>
        {queue.length > 0 && (
          <div className="max-h-[78px] overflow-y-auto rounded-[10px] border border-[#2E2822] bg-[#120F0C]">
            {queue.slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-center gap-2 border-b border-[#221E19] px-3 py-2 text-xs last:border-0">
                <span className={`h-2 w-2 rounded-full ${item.status === 'synced' ? 'bg-lime' : item.status === 'failed' ? 'bg-danger' : item.status === 'approval_required' ? 'bg-warn' : 'bg-[#8A7F76]'}`} />
                <span className="font-mono text-[#D8CFC6]">{item.localReceiptNo}</span>
                <span className="text-[#8A7F76]">{QUEUE_STATUS_LABELS[item.status]}</span>
                <span className="ml-auto text-[#A79C92]">{som(item.snapshot.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 gap-2 overflow-x-auto px-5 pb-2 pt-4">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSelectCategory(c)}
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
        <div className="grid grid-cols-3 gap-3" data-testid="pos-product-grid">
          {grid.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAdd(p)}
              className="min-w-0 rounded-[14px] border border-[#2E2822] bg-[#221E19] p-3 text-left transition hover:border-lime/40 focus-visible:border-lime focus-visible:outline-none"
            >
              <div className="relative mb-2.5 h-20 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#2A2620] to-[#16130F]">
                <Image src={productImage(p)} alt={p.name} fill sizes="120px" className="object-contain p-2" />
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
    </section>
  );
}
