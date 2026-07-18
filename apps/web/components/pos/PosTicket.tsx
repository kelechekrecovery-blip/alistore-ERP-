'use client';

import Image from 'next/image';
import { som } from '@/lib/format';
import { productImage } from '@/components/ProductCard';
import type { CatalogProduct } from '@/lib/api';

export interface PosTicketLine {
  product: CatalogProduct;
  qty: number;
}

interface PosTicketProps {
  lines: PosTicketLine[];
  count: number;
  subtotal: number;
  total: number;
  discPct: number;
  discIdx: number;
  discounts: readonly number[];
  onClear: () => void;
  onSetQty: (id: string, qty: number) => void;
  onSetDiscount: (idx: number) => void;
  onCheckout: () => void;
}

/**
 * Right-hand receipt panel of the POS terminal: line items with qty steppers, the
 * discount chips, running totals, and the "К оплате" trigger. Presentational — all
 * cart state and the checkout handoff live in the POS page.
 */
export function PosTicket({
  lines,
  count,
  subtotal,
  total,
  discPct,
  discIdx,
  discounts,
  onClear,
  onSetQty,
  onSetDiscount,
  onCheckout,
}: PosTicketProps) {
  return (
    <aside data-testid="pos-ticket" className="flex w-[420px] flex-shrink-0 flex-col bg-surface">
      <div className="flex flex-shrink-0 items-center border-b border-surface-3 px-5 py-4">
        <span className="font-display text-[17px] font-bold text-white">Чек</span>
        <span className="ml-2 text-sm text-subtle">{count} поз.</span>
        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-sm text-danger-soft hover:text-danger"
          >
            Очистить
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {lines.length === 0 ? (
          <div className="py-16 text-center text-faint">
            <div className="text-5xl">🧾</div>
            <div className="mt-3 text-sm">Добавьте товары тапом</div>
          </div>
        ) : (
          lines.map((l) => (
            <div key={l.product.id} className="flex gap-3 border-b border-surface-2 py-3">
              <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-[9px] bg-surface-3">
                {productImage(l.product) ? <Image src={productImage(l.product)!} alt={l.product.name} fill sizes="44px" className="object-contain p-1" /> : <span className="grid h-full place-items-center font-bold text-slate">{l.product.name.slice(0,1)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white">{l.product.name}</div>
                <div className="mt-0.5 text-xs text-subtle">{som(l.product.price)}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex items-center gap-3 rounded-[7px] bg-surface-2 px-2 py-1">
                    <button type="button" onClick={() => onSetQty(l.product.id, l.qty - 1)} className="text-white">
                      −
                    </button>
                    <span className="font-mono text-[13px] text-white">{l.qty}</span>
                    <button type="button" onClick={() => onSetQty(l.product.id, l.qty + 1)} className="text-white">
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
        <div className="flex-shrink-0 border-t border-surface-3 px-5 py-4">
          <div className="mb-3 flex gap-2">
            {discounts.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => onSetDiscount(i)}
                className={`flex-1 rounded-[9px] border py-2 text-center text-xs font-semibold transition ${
                  discIdx === i
                    ? 'border-lime bg-lime text-lime-ink'
                    : 'border-surface-3 bg-surface-2 text-bright'
                }`}
              >
                {d}%
              </button>
            ))}
          </div>
          <div className="flex justify-between py-0.5 text-[13px] text-muted">
            Подытог <span className="text-bright tabular">{som(subtotal)}</span>
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
            onClick={onCheckout}
            className="mt-3 w-full rounded-[12px] bg-lime py-3.5 text-center text-base font-bold text-lime-ink transition hover:brightness-95"
          >
            К оплате
          </button>
        </div>
      )}
    </aside>
  );
}
