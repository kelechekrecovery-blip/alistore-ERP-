'use client';

import { useEffect, useState } from 'react';
import { fetchPricing, type PricingReport, type PricingReview } from '@/lib/ai';
import { som } from '@/lib/format';

const ACTION_META: Record<PricingReview['action'], { color: string; arrow: string; label: string }> = {
  raise: { color: '#C6FF3D', arrow: '↑', label: 'Поднять' },
  discount: { color: '#FF8A7A', arrow: '↓', label: 'Скидка' },
  hold: { color: '#8A7F76', arrow: '=', label: 'Держать' },
};

/** Dynamic-pricing recommendations — stock-vs-demand rule engine (Phase 11, keyless). */
export function PricingView({ accessToken }: { accessToken: string }) {
  const [report, setReport] = useState<PricingReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchPricing(accessToken).then(setReport).catch(() => setFailed(true));
  }, [accessToken]);

  if (failed) return <p className="font-mono text-sm text-danger-soft">Не удалось загрузить рекомендации.</p>;
  if (report === null) return <p className="font-mono text-sm text-faint">Считаю рекомендации…</p>;

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-2.5 rounded-[14px] border border-surface-3 bg-surface px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-base">🏷️</span>
        <div>
          <div className="text-[13px] font-semibold">Ценовые рекомендации</div>
          <div className="text-[11px] text-subtle">
            Правила спрос/остаток по Event Ledger · {report.actionable} из {report.generatedForCount} требуют внимания · ключ рынка подключит разведку цен
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-surface-3 bg-surface">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-surface-3 bg-ink-dark px-5 py-2.5 text-[11px] uppercase tracking-wide text-subtle">
          <span>Товар</span>
          <span className="text-right">Остаток · спрос</span>
          <span className="text-right">Цена</span>
          <span className="text-right">Действие</span>
        </div>
        {report.reviews.map((r) => {
          const m = ACTION_META[r.action];
          const actionable = r.action !== 'hold';
          return (
            <div key={r.sku} className="border-b border-surface-2 px-5 py-3 last:border-0">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">{r.name}</div>
                  <div className="text-[11px] text-subtle">{r.category}</div>
                </div>
                <div className="text-right font-mono text-[12px] text-muted">
                  <span className="text-white">{r.inStock}</span> шт · <span className="text-white">{r.soldUnits}</span> прод
                </div>
                <div className="text-right font-mono text-[13px] tabular">
                  {actionable ? (
                    <span>
                      <span className="text-faint line-through">{som(r.current)}</span>{' '}
                      <span style={{ color: m.color }}>{som(r.suggested)}</span>
                    </span>
                  ) : (
                    <span className="text-bright">{som(r.current)}</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1.5 text-right">
                  <span className="font-mono text-[13px]" style={{ color: m.color }}>{m.arrow}</span>
                  <span
                    className="rounded-chip px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: m.color, background: actionable ? `${m.color}1A` : 'transparent' }}
                  >
                    {actionable ? `${m.label} ${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%` : m.label}
                  </span>
                </div>
              </div>
              {actionable && <div className="mt-1.5 text-[12px] text-subtle">{r.reason}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
