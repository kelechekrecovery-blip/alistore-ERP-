'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from './Card';
import { AsyncPanel } from './AsyncPanel';
import { som } from '@/lib/format';
import { fetchPayroll, type Kpi, type Payroll } from '@/lib/reports';

/**
 * KPI and payroll.
 *
 * This screen used to render a `STAFF` constant — six invented employees with
 * invented bonuses and penalties — while the real `kpi` prop was destructured and
 * never read. Every figure below now comes from `/reports/kpi` and
 * `/reports/payroll`; the columns that existed only in the mock (a «KPI %» score
 * and per-person penalties) are gone, because the system does not compute them.
 */
export function KpiView({ kpi, accessToken }: { kpi: Kpi | null; accessToken: string }) {
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setPayroll(null);
    try {
      setPayroll(await fetchPayroll(accessToken));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить расчёт по продавцам');
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <header className="border-b border-surface-3 pb-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF7A4D]">Центр управления · Analytics 3.0</div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">KPI и зарплаты</h1>
        <p className="mt-1 text-xs leading-5 text-subtle">Выручка, маржа и расчёт по продавцам — из Event Ledger.</p>
      </header>

      <Card className="p-5">
        <div className="mb-3.5 font-display text-[15px] font-bold text-white">Показатели</div>
        {kpi === null ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ['Выручка', som(kpi.revenue), '#fff'],
              ['Себестоимость', som(kpi.cogs), '#E5DCD3'],
              ['Валовая маржа', som(kpi.grossMargin), kpi.grossMargin > 0 ? '#C6FF3D' : '#FF8A7A'],
              ['Маржа', `${kpi.marginPct.toFixed(1)}%`, kpi.marginPct > 0 ? '#C6FF3D' : '#FF8A7A'],
              ['Средний чек', som(kpi.avgCheck), '#E5DCD3'],
              ['Оплачено заказов', String(kpi.paidOrders), '#E5DCD3'],
            ] as const).map(([label, value, color]) => (
              <div key={label} data-testid="kpi-metric" className="erp3-glass rounded-[14px] p-3.5">
                <div className="text-[11px] text-muted">{label}</div>
                <div className="mt-1.5 font-display text-[19px] font-extrabold tabular" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        {kpi && kpi.revenue === 0 && (
          <p className="mt-3 text-[11px] text-subtle">Продаж пока нет — показатели заполнятся после первых оплат.</p>
        )}
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3.5 font-display text-[15px] font-bold text-white">Топ товаров по выручке</div>
          {kpi === null ? <p className="text-sm text-muted">Загрузка…</p>
            : kpi.topProducts.length === 0 ? <p className="text-sm text-muted">Продаж пока не было</p>
            : (
              <div className="flex flex-col">
                <div className="grid grid-cols-[1.6fr_0.6fr_1fr] border-b border-surface-3 pb-2 text-xs text-subtle">
                  <span>Товар</span><span className="text-right">Штук</span><span className="text-right">Выручка</span>
                </div>
                {kpi.topProducts.map((product) => (
                  <div key={product.sku} className="grid grid-cols-[1.6fr_0.6fr_1fr] items-center border-b border-surface-2 py-2.5 text-sm last:border-b-0">
                    <span className="min-w-0 truncate text-white">{product.name}<span className="ml-2 font-mono text-[10px] text-subtle">{product.sku}</span></span>
                    <span className="text-right font-mono text-muted">{product.units}</span>
                    <span className="text-right font-mono text-white">{som(product.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
        </Card>

        <AsyncPanel
          data={payroll}
          error={error}
          onRetry={() => void load()}
          isEmpty={(data) => data.rows.length === 0}
          emptyText="Продаж по сменам пока не было — расчёт появится после первых оплат на кассе."
          loadingText="Считаем расчёт по продавцам…"
        >
          {(data) => (
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="font-display text-[15px] font-bold text-white">Расчёт по продавцам</div>
                <span className="text-[11px] text-subtle">оклад {som(data.base)} + {data.commissionPct}% с оборота</span>
              </div>
              <div className="mt-3 grid grid-cols-[1.3fr_1fr_0.6fr_1fr_1fr] border-b border-surface-3 pb-2 text-xs text-subtle">
                <span>Сотрудник</span><span className="text-right">Оборот</span><span className="text-right">Продаж</span><span className="text-right">Комиссия</span><span className="text-right">Итого</span>
              </div>
              <div className="max-h-[380px] overflow-y-auto">
                {data.rows.map((row) => (
                  <div key={row.staffId} data-testid="payroll-row" className="grid grid-cols-[1.3fr_1fr_0.6fr_1fr_1fr] items-center border-b border-surface-2 py-2.5 text-sm last:border-b-0">
                    <span className="min-w-0 truncate text-white">{row.username}</span>
                    <span className="text-right font-mono text-muted">{som(row.revenue)}</span>
                    <span className="text-right font-mono text-muted">{row.sales}</span>
                    <span className="text-right font-mono text-lime">{som(row.commission)}</span>
                    <span className="text-right font-mono font-bold text-white">{som(row.total)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-surface-3 pt-3">
                <span className="text-xs text-subtle">К выплате</span>
                <span className="font-display text-lg font-extrabold text-white">{som(data.totalPayout)}</span>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-subtle">
                Комиссия считается с оборота, а не с маржи: продавец, дающий скидки, зарабатывает больше.
                Ставки меняются в разделе «Параметры».
              </p>
            </Card>
          )}
        </AsyncPanel>
      </div>
    </div>
  );
}
