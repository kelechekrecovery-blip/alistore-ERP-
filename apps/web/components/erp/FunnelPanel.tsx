'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchFunnel, type Funnel, type FunnelStage } from '@/lib/reports';

/** views → carts → checkouts as a percentage of views (null when no views). */
function rate(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/**
 * Storefront funnel for the owner: product views → add-to-cart → checkout over a
 * period, with a per-source (campaign) breakdown. Reads GET /reports/funnel — the
 * server aggregate over first-party AnalyticsEvent, not an external tracker.
 */
export function FunnelPanel({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      setFunnel(await fetchFunnel(from.toISOString(), to.toISOString(), accessToken));
    } catch {
      setFunnel(null);
      setError('Не удалось загрузить воронку');
    }
  }, [accessToken, days]);

  useEffect(() => { void load(); }, [load]);

  const sources = funnel
    ? Object.entries(funnel.bySource).sort((a, b) => b[1].productViews - a[1].productViews)
    : [];

  return (
    <section className="rounded-[16px] border border-surface-3 bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="font-display text-[15px] font-bold">Воронка витрины</div>
        <select aria-label="Период воронки" value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-auto h-9 rounded-[8px] border border-surface-3 bg-surface px-2 text-sm text-white">
          <option value={7}>7 дней</option>
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
        </select>
      </div>

      {error && <p className="text-sm text-danger-soft">{error}</p>}

      {funnel && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stage label="Просмотры" value={funnel.productViews} sub="100%" />
            <Stage label="В корзину" value={funnel.addToCarts} sub={rate(funnel.addToCarts, funnel.productViews)} />
            <Stage label="Оформление" value={funnel.checkoutsStarted} sub={rate(funnel.checkoutsStarted, funnel.productViews)} />
          </div>

          {sources.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-faint">
                    <th className="px-3 py-2 font-medium">Источник</th>
                    <th className="px-3 py-2 font-medium text-right">Просмотры</th>
                    <th className="px-3 py-2 font-medium text-right">В корзину</th>
                    <th className="px-3 py-2 font-medium text-right">Оформление</th>
                    <th className="px-3 py-2 font-medium text-right">Конверсия</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map(([source, stage]) => (
                    <tr key={source} className="border-t border-surface-3">
                      <td className="px-3 py-2 text-white">{source}</td>
                      <td className="px-3 py-2 text-right text-muted">{stage.productViews}</td>
                      <td className="px-3 py-2 text-right text-muted">{stage.addToCarts}</td>
                      <td className="px-3 py-2 text-right text-muted">{stage.checkoutsStarted}</td>
                      <td className="px-3 py-2 text-right text-white">{rate(stage.checkoutsStarted, stage.productViews)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stage({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-[12px] bg-surface-2 px-3 py-3 text-center">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold text-white">{value}</div>
      <div className="text-[11px] text-lime">{sub}</div>
    </div>
  );
}
