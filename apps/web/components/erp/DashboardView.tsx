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

const DEFAULT_KPIS: KpiItem[] = [
  { label: 'Выручка сегодня', value: '1.24 млн', color: '#fff', delta: '▲ 12% ко вчера', deltaColor: '#C6FF3D' },
  { label: 'Чеков', value: '47', color: '#fff', delta: 'средний 26 400', deltaColor: '#8A7F76' },
  { label: 'Наличные в кассе', value: '312к', color: '#fff', delta: '3 филиала', deltaColor: '#8A7F76' },
  { label: 'Долги/рассрочка', value: '1.8 млн', color: '#E5B23C', delta: '6 просрочек', deltaColor: '#FF8A7A' },
  { label: 'Маржа', value: '27.4%', color: '#C6FF3D', delta: '▲ 1.2 п.п.', deltaColor: '#C6FF3D' },
  { label: 'Возвраты', value: '2.1%', color: '#FF8A7A', delta: '−0.4 п.п.', deltaColor: '#C6FF3D' },
];

const DEFAULT_BARS = [
  { day: 'Пн', h: 60 },
  { day: 'Вт', h: 80 },
  { day: 'Ср', h: 55 },
  { day: 'Чт', h: 95 },
  { day: 'Пт', h: 120 },
  { day: 'Сб', h: 140 },
  { day: 'Вс', h: 100 },
];

interface Decision {
  text: string;
  action: string;
  color: string;
  tab?: string;
}

const DEFAULT_DECISIONS: Decision[] = [
  { text: 'iPhone 15 осталось на 2 дня', action: 'Оформить закупку 40 шт', color: '#FF5B2E' },
  { text: 'Филиал Ош отстаёт по KPI −18%', action: 'Открыть KPI', color: '#E5B23C' },
  { text: '340 уснувших клиентов', action: 'Запустить реактивацию', color: '#7FB0EC' },
];

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

const SECONDARY_KPIS = [
  ['Конверсия', '34%', '#C6FF3D'],
  ['Возвраты', '2.1%', '#FF8A7A'],
  ['Новые клиенты', '12', '#C6FF3D'],
  ['Онлайн-доля', '28%', '#C6FF3D'],
  ['Ср. время сделки', '7 мин', '#E5DCD3'],
  ['Позиций в чеке', '1.8', '#C6FF3D'],
  ['Отмены', '3', '#FF8A7A'],
  ['NPS', '72', '#C6FF3D'],
] as const;

interface DashboardViewProps {
  d: Dashboard | null;
  risks: RiskSignal[];
  revenue: { day: string; amount: number }[];
  trend: RevenueTrend | null;
  period: number;
  accessToken: string;
  onPeriod: (days: number) => void;
  onSignal: (kind: string) => void;
}

/** Owner overview matching the latest AliStore ERP 3.0 handoff. */
export function DashboardView({ d, risks, onSignal }: DashboardViewProps) {
  const kpis = useMemo<KpiItem[]>(() => {
    if (!d) return DEFAULT_KPIS;
    return [
      { label: 'Выручка сегодня', value: som(d.money.salesGross), color: '#fff', delta: '▲ 12% ко вчера', deltaColor: '#C6FF3D' },
      { label: 'Чеков', value: String(d.orders.total), color: '#fff', delta: 'средний 26 400', deltaColor: '#8A7F76' },
      { label: 'Наличные в кассе', value: '312к', color: '#fff', delta: '3 филиала', deltaColor: '#8A7F76' },
      { label: 'Долги/рассрочка', value: '1.8 млн', color: '#E5B23C', delta: '6 просрочек', deltaColor: '#FF8A7A' },
    ];
  }, [d]);

  const decisions = useMemo<Decision[]>(() => {
    if (risks.length === 0) return DEFAULT_DECISIONS;
    return risks.slice(0, 5).map((r) => ({
      text: r.detail,
      action: 'перейти →',
      color: SEV_COLOR[r.severity] ?? '#8A7F76',
    }));
  }, [risks]);

  return (
    <>
      <div className="mb-[14px] rounded-[16px] border border-[#ff5b2e]/25 bg-[radial-gradient(circle_at_0%_0%,rgba(255,91,46,.22),transparent_42%),linear-gradient(120deg,rgba(255,255,255,.08),rgba(255,255,255,.025))] p-4 shadow-[0_16px_40px_rgba(0,0,0,.3)] sm:flex sm:items-center sm:gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-coral text-xl shadow-[0_0_20px_rgba(255,91,46,.35)]">🤖</span>
        <div className="mt-3 min-w-0 sm:mt-0 sm:flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[.12em] text-[#ff9a6e]">AI-сводка · сейчас</div>
          <p className="mt-1 text-[13px] leading-5 text-white/80">Выручка на <strong className="text-[#c6ff3d]">12% выше</strong> среднего вторника. В кассе Ош 340к — нормальный лимит, рекомендую инкассацию. iPhone 15 хватит на <strong className="text-[#ff9a6e]">2 дня</strong>.</p>
        </div>
        <button type="button" onClick={() => onSignal('ai')} className="mt-3 shrink-0 rounded-[10px] border border-white/15 bg-white/[.07] px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-[#ff7a4d] hover:text-white sm:mt-0">Спросить AI →</button>
      </div>
      <div className="mb-[18px] grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Metric key={k.label} {...k} />
        ))}
      </div>
      <div className="mb-[18px] grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 bg-white/[.035] sm:grid-cols-4 lg:grid-cols-8">
        {SECONDARY_KPIS.map(([label, value, color]) => <div key={label} className="border-b border-r border-white/[.08] px-3 py-3 last:border-r-0 sm:border-b-0"><div className="text-[10px] leading-4 text-muted">{label}</div><div className="mt-1 font-mono text-[15px] font-bold" style={{ color }}>{value}</div></div>)}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 font-display text-[15px] font-bold text-white">Выручка · 7 дней</div>
          <div className="flex h-[160px] items-end gap-2.5">
            {DEFAULT_BARS.map((b) => (
              <div key={b.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-[6px] bg-gradient-to-b from-[#FF9A6E] to-coral shadow-[0_0_14px_rgba(255,91,46,0.38)]"
                  style={{ height: `${b.h}px` }}
                />
                <span className="text-[10px] text-subtle">{b.day}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3.5 font-display text-[15px] font-bold text-white">Требуют решения</div>
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
