'use client';

import { useEffect, useState } from 'react';
import { fetchReorder, type ReorderReport, type ReorderReview } from '@/lib/ai';

const URGENCY_META: Record<ReorderReview['urgency'], { color: string; dot: string; label: string }> = {
  high: { color: '#FF8A7A', dot: '🔴', label: 'Срочно' },
  medium: { color: '#E5B23C', dot: '🟡', label: 'Скоро' },
  low: { color: '#8A7F76', dot: '⚪', label: 'Следить' },
  none: { color: '#8A7F76', dot: '', label: 'Достаточно' },
};

/** Restock recommendations — understock mirror of pricing (Phase 11, keyless). */
export function ReorderView({ accessToken }: { accessToken: string }) {
  const [report, setReport] = useState<ReorderReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchReorder(accessToken).then(setReport).catch(() => setFailed(true));
  }, [accessToken]);

  if (failed) return <p className="font-mono text-sm text-[#FF8A7A]">Не удалось загрузить закупки.</p>;
  if (report === null) return <p className="font-mono text-sm text-[#6E645C]">Считаю потребность…</p>;

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-2.5 rounded-[14px] border border-[#2E2822] bg-[#1A1611] px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#221E19] text-base">🛒</span>
        <div>
          <div className="text-[13px] font-semibold">Рекомендации по закупкам</div>
          <div className="text-[11px] text-[#8A7F76]">
            Спрос/остаток по Event Ledger · {report.needsReorder} из {report.generatedForCount} требуют дозаказа · ключ подключит прогноз спроса
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-[#2E2822] bg-[#1A1611]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-[#2E2822] bg-[#16130F] px-5 py-2.5 text-[11px] uppercase tracking-wide text-[#8A7F76]">
          <span>Товар</span>
          <span className="text-right">Нал · рез · спрос</span>
          <span className="text-right">Дозаказ</span>
          <span className="text-right">Срочность</span>
        </div>
        {report.reviews.map((r) => {
          const m = URGENCY_META[r.urgency];
          return (
            <div key={r.sku} className="border-b border-[#221E19] px-5 py-3 last:border-0">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">{r.name}</div>
                  <div className="text-[11px] text-[#8A7F76]">{r.category}</div>
                </div>
                <div className="text-right font-mono text-[12px] text-[#A79C92]">
                  <span className={r.inStock === 0 ? 'text-[#FF8A7A]' : 'text-white'}>{r.inStock}</span> · {r.reserved} ·{' '}
                  <span className="text-white">{r.soldUnits}</span>
                </div>
                <div className="text-right font-mono text-[13px] tabular">
                  {r.needsReorder ? (
                    <span className="font-semibold text-white">+{r.suggestedQty} шт</span>
                  ) : (
                    <span className="text-[#6E645C]">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {r.needsReorder ? (
                    <span
                      className="rounded-chip px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color: m.color, background: `${m.color}1A` }}
                    >
                      {m.dot} {m.label}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#6E645C]">достаточно</span>
                  )}
                </div>
              </div>
              {r.needsReorder && <div className="mt-1.5 text-[12px] text-[#8A7F76]">{r.reason}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
