'use client';

import { useEffect, useState } from 'react';
import { fetchPayroll, type Kpi, type Payroll } from '@/lib/reports';
import { som } from '@/lib/format';

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] border border-surface-3 bg-surface p-5">{children}</div>;
}

function Metric({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[16px] border border-surface-3 bg-surface" style={{ padding: 18 }}>
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-extrabold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

/** Owner margin/KPI tab: gross margin, top products, seller KPIs + advisory payroll. */
export function KpiView({ kpi, accessToken }: { kpi: Kpi | null; accessToken: string }) {
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  useEffect(() => {
    fetchPayroll(accessToken).then(setPayroll).catch(() => setPayroll(null));
  }, [accessToken]);

  if (!kpi) return <p className="font-mono text-sm text-faint">Загрузка…</p>;
  const maxRev = Math.max(1, ...kpi.topProducts.map((p) => p.revenue));
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label="Валовая маржа" value={som(kpi.grossMargin)} color="#C6FF3D" />
        <Metric label="Маржа %" value={`${kpi.marginPct}%`} color={kpi.marginPct < 10 ? '#E5B23C' : '#C6FF3D'} />
        <Metric label="Средний чек" value={som(kpi.avgCheck)} />
        <Metric label="Себестоимость" value={som(kpi.cogs)} color="#FF8A7A" />
      </div>
      <Card>
        <div className="mb-4 flex items-center">
          <span className="font-display text-[15px] font-bold">Топ товары по выручке</span>
          <span className="ml-auto text-xs text-subtle">выручка · {kpi.paidOrders} оплаченных заказов</span>
        </div>
        {kpi.topProducts.length === 0 && <p className="text-sm text-subtle">Пока нет продаж.</p>}
        {kpi.topProducts.map((p) => (
          <div key={p.sku} className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-bright">{p.name}</span>
              <span className="font-mono tabular text-white">{som(p.revenue)} · {p.units} шт</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-gradient-to-r from-lime to-[#8FD40F]" style={{ width: `${(p.revenue / maxRev) * 100}%` }} />
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-3.5">
        <Card>
          <div className="mb-3.5 font-display text-[15px] font-bold">KPI продавцов</div>
          {kpi.sellers.length === 0 && <p className="text-sm text-subtle">Нет продаж по сменам.</p>}
          {kpi.sellers.map((s, i) => (
            <div key={s.staffId} className="flex items-center gap-3 border-b border-surface-2 py-2.5 text-[13px] last:border-0">
              <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[11px] text-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-bright">{s.staffId}</span>
              <span className="text-subtle">{s.sales} продаж</span>
              <span className="font-mono tabular font-semibold text-white">{som(s.revenue)}</span>
            </div>
          ))}
        </Card>
      </div>

      {payroll && payroll.rows.length > 0 && (
        <div className="mt-3.5">
          <Card>
            <div className="mb-3.5 flex items-center">
              <span className="font-display text-[15px] font-bold">Зарплаты продавцов</span>
              <span className="ml-auto text-xs text-subtle">
                база {som(payroll.base)} + {payroll.commissionPct}% с оборота · фонд {som(payroll.totalPayout)}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-surface-3 pb-2 text-[11px] uppercase tracking-wide text-subtle">
              <span>Продавец</span>
              <span className="text-right">База</span>
              <span className="text-right">Комиссия</span>
              <span className="text-right">К выплате</span>
            </div>
            {payroll.rows.map((r) => (
              <div key={r.staffId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-surface-2 py-2.5 text-[13px] last:border-0">
                <span className="min-w-0 truncate text-bright">{r.staffId}</span>
                <span className="text-right font-mono tabular text-subtle">{som(r.base)}</span>
                <span className="text-right font-mono tabular text-lime">+{som(r.commission)}</span>
                <span className="text-right font-mono tabular font-semibold text-white">{som(r.total)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}
