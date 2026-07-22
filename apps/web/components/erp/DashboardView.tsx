import { useMemo } from 'react';
import type { Dashboard, RevenueTrend, RiskSignal } from '@/lib/reports';
import { som } from '@/lib/format';
import { Card } from './Card';

const SEV_COLOR: Record<string, string> = { high: '#FF8A7A', medium: '#E5B23C', low: '#8A7F76' };

interface KpiItem {
  label: string;
  value: string;
  color?: string;
  delta: string;
  deltaColor: string;
}

/** Placeholders shown only while the dashboard is loading — never fabricated figures. */
const LOADING_KPIS: KpiItem[] = [
  { label: 'Выручка сегодня', value: '—', color: '#fff', delta: 'загрузка…', deltaColor: '#8A7F76' },
  { label: 'Чеков сегодня', value: '—', color: '#fff', delta: 'загрузка…', deltaColor: '#8A7F76' },
  { label: 'Наличные в кассах', value: '—', color: '#fff', delta: 'загрузка…', deltaColor: '#8A7F76' },
  { label: 'Долги/рассрочка', value: '—', color: '#E5B23C', delta: 'загрузка…', deltaColor: '#8A7F76' },
  { label: 'Возвраты', value: '—', color: '#FF8A7A', delta: 'загрузка…', deltaColor: '#8A7F76' },
  { label: 'На согласовании', value: '—', color: '#fff', delta: 'загрузка…', deltaColor: '#8A7F76' },
];

const WEEKDAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Short weekday label for a YYYY-MM-DD bucket key. */
function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso.slice(5) : WEEKDAY_RU[date.getUTCDay()];
}

interface Decision {
  text: string;
  action: string;
  color: string;
  tab?: string;
}


function Metric({ label, value, color = '#fff', delta, deltaColor }: KpiItem) {
  return (
    <div data-testid="kpi-metric" className="erp3-glass rounded-[16px] p-[15px]">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1.5 font-display text-[26px] font-extrabold tabular" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: deltaColor }}>
        {delta}
      </div>
    </div>
  );
}

/**
 * Operational counters derived from the dashboard payload. Everything here is
 * real — metrics the API does not compute (конверсия, NPS, ср. чек по времени)
 * are deliberately absent rather than invented.
 */
function buildSecondaryKpis(d: Dashboard | null): { label: string; value: string; color: string }[] {
  if (!d) return [];
  const countOf = (rows: { status: string; count: number }[], status: string) =>
    rows.find((r) => r.status === status)?.count ?? 0;
  const inStock = countOf(d.stock.byStatus, 'in_stock');
  const sold = countOf(d.stock.byStatus, 'sold');
  const avgCheck = d.orders.total > 0 ? Math.round(d.money.salesGross / d.orders.total) : 0;
  return [
    { label: 'Смен открыто', value: String(d.cash?.openShifts ?? d.ops.openShifts), color: '#E5DCD3' },
    { label: 'На согласовании', value: String(d.ops.pendingApprovals), color: d.ops.pendingApprovals > 0 ? '#E5B23C' : '#C6FF3D' },
    { label: 'Просрочено долгов', value: d.debts ? String(d.debts.overdue) : '—', color: d.debts && d.debts.overdue > 0 ? '#FF8A7A' : '#C6FF3D' },
    { label: 'Средний чек', value: som(avgCheck), color: '#E5DCD3' },
    { label: 'Заказов всего', value: String(d.orders.total), color: '#E5DCD3' },
    { label: 'Единиц в наличии', value: String(inStock), color: '#C6FF3D' },
    { label: 'Продано единиц', value: String(sold), color: '#E5DCD3' },
    { label: 'Расходы', value: som(d.money.expenses), color: '#E5DCD3' },
  ];
}

interface DashboardViewProps {
  d: Dashboard | null;
  risks: RiskSignal[] | null;
  revenue: { day: string; amount: number }[];
  trend: RevenueTrend | null;
  period: number;
  accessToken: string;
  onPeriod: (days: number) => void;
  onSignal: (kind: string) => void;
}

/** Owner overview matching the latest AliStore ERP 3.0 handoff. */
export function DashboardView({ d, risks, revenue, trend, onSignal }: DashboardViewProps) {
  const kpis = useMemo<KpiItem[]>(() => {
    if (!d) return LOADING_KPIS;
    const refundPct = d.money.salesGross > 0 ? (d.money.refunds / d.money.salesGross) * 100 : 0;
    const trendDelta =
      trend?.deltaPct == null
        ? 'нет базы для сравнения'
        : `${trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '='} ${Math.abs(trend.deltaPct)}% к прошлому периоду`;
    const trendColor = trend?.direction === 'down' ? '#FF8A7A' : trend?.direction === 'up' ? '#C6FF3D' : '#8A7F76';
    const { today, cash, debts } = d;
    return [
      { label: 'Выручка сегодня', value: today ? som(today.salesGross) : '—', color: '#fff', delta: today ? trendDelta : 'нет данных', deltaColor: trendColor },
      { label: 'Заказов сегодня', value: today ? String(today.orders) : '—', color: '#fff', delta: `всего ${d.orders.total}`, deltaColor: '#8A7F76' },
      {
        label: 'Наличные в кассах',
        value: cash ? som(cash.inDrawers) : '—',
        color: '#fff',
        delta: cash ? (cash.openShifts === 1 ? '1 открытая смена' : `${cash.openShifts} открытых смен`) : 'нет данных',
        deltaColor: '#8A7F76',
      },
      {
        label: 'Долги/рассрочка',
        value: debts ? som(debts.openBalance) : '—',
        color: '#E5B23C',
        delta: debts ? (debts.overdue > 0 ? `${debts.overdue} просрочено` : 'без просрочек') : 'нет данных',
        deltaColor: debts && debts.overdue > 0 ? '#FF8A7A' : '#C6FF3D',
      },
      {
        label: 'Возвраты',
        value: `${refundPct.toFixed(1)}%`,
        color: '#FF8A7A',
        delta: som(d.money.refunds),
        deltaColor: '#8A7F76',
      },
      {
        label: 'На согласовании',
        value: String(d.ops.pendingApprovals),
        color: d.ops.pendingApprovals > 0 ? '#E5B23C' : '#C6FF3D',
        delta: d.ops.pendingApprovals > 0 ? 'ждут решения' : 'очередь пуста',
        deltaColor: '#8A7F76',
      },
    ];
  }, [d, trend]);

  const secondary = useMemo(() => buildSecondaryKpis(d), [d]);

  /** Bars scaled to the tallest day; empty week renders a flat honest baseline. */
  const bars = useMemo(() => {
    const max = revenue.reduce((peak, point) => Math.max(peak, point.amount), 0);
    return revenue.map((point) => ({
      day: dayLabel(point.day),
      amount: point.amount,
      height: max > 0 ? Math.max(4, Math.round((point.amount / max) * 150)) : 4,
    }));
  }, [revenue]);

  const decisions = useMemo<Decision[]>(
    () =>
      (risks ?? []).slice(0, 5).map((r) => ({
        text: r.detail,
        action: 'перейти',
        color: SEV_COLOR[r.severity] ?? '#8A7F76',
        tab: r.kind,
      })),
    [risks],
  );

  return (
    <>
      <div className="mb-[14px] rounded-[16px] border border-[#ff5b2e]/25 bg-[radial-gradient(circle_at_0%_0%,rgba(255,91,46,.22),transparent_42%),linear-gradient(120deg,rgba(255,255,255,.08),rgba(255,255,255,.025))] p-4 shadow-[0_16px_40px_rgba(0,0,0,.3)] sm:flex sm:items-center sm:gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-coral text-xl shadow-[0_0_20px_rgba(255,91,46,.35)]">🤖</span>
        <div className="mt-3 min-w-0 sm:mt-0 sm:flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[.12em] text-[#ff9a6e]">AI-ассистент</div>
          <p className="mt-1 text-[13px] leading-5 text-white/80">
            {!d
              ? 'Загрузка данных…'
              : risks === null
                ? 'Сигналы не загружены — «открытых сигналов нет» утверждать нельзя.'
                : risks.length > 0
                  ? <>Открытых сигналов: <strong className="text-[#ff9a6e]">{risks.length}</strong>. Спросите ассистента о выручке, остатках или рисках.</>
                  : <>Открытых сигналов нет. Спросите ассистента о выручке, остатках или закупках.</>}
          </p>
        </div>
        <button type="button" onClick={() => onSignal('ai')} className="mt-3 shrink-0 rounded-[10px] border border-white/15 bg-white/[.07] px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-[#ff7a4d] hover:text-white sm:mt-0">Спросить AI →</button>
      </div>
      <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Metric key={k.label} {...k} />
        ))}
      </div>
      {secondary.length > 0 && (
        <div className="mb-[18px] grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 bg-white/[.035] sm:grid-cols-4 lg:grid-cols-8">
          {secondary.map(({ label, value, color }) => (
            <div key={label} className="border-b border-r border-white/[.08] px-3 py-3 last:border-r-0 sm:border-b-0">
              <div className="text-[10px] leading-4 text-muted">{label}</div>
              <div className="mt-1 font-mono text-[15px] font-bold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 font-display text-[15px] font-bold text-white">Выручка · 7 дней</div>
          {bars.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center text-[12px] text-muted">Нет данных о выручке за период</div>
          ) : (
            <div data-testid="dashboard-revenue-chart" className="flex h-[160px] items-end gap-2.5">
              {bars.map((b, index) => (
                <div key={`${b.day}-${index}`} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t-[6px] bg-gradient-to-b from-[#FF9A6E] to-coral shadow-[0_0_14px_rgba(255,91,46,0.38)]"
                    style={{ height: `${b.height}px` }}
                    title={som(b.amount)}
                  />
                  <span className="text-[10px] text-subtle">{b.day}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3.5 font-display text-[15px] font-bold text-white">Требуют решения</div>
          {decisions.length === 0 && (
            <p className="text-[12px] leading-5 text-muted">
              {!d ? 'Загрузка…' : risks === null ? 'Сигналы не загружены.' : 'Открытых сигналов нет.'}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {decisions.map((decision, index) => (
              <button
                key={index}
                type="button"
                data-testid="risk-decision"
                onClick={() => decision.tab && onSignal(decision.tab)}
                className="block w-full border-l-[3px] py-1 pl-3 text-left"
                style={{ borderColor: decision.color }}
              >
                <div className="text-[13px] leading-[1.4] text-white">{decision.text}</div>
                <div className="mt-1 text-[12px]" style={{ color: '#C6FF3D' }}>
                  {decision.action} →
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
