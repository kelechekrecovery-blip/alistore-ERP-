'use client';

import { useState } from 'react';
import { fetchRevenueRange, type Dashboard, type RevenueRange, type RevenueTrend, type RiskSignal } from '@/lib/reports';
import { som } from '@/lib/format';

const SEV_COLOR: Record<string, string> = { high: '#FF8A7A', medium: '#E5B23C', low: '#8A7F76' };

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611] p-5">{children}</div>;
}

function Metric({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-[16px] border border-[#2E2822] bg-[#1A1611]" style={{ padding: 18 }}>
      <div className="text-xs text-[#8A7F76]">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-extrabold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: RevenueTrend | null }) {
  if (!trend) return null;
  const color = trend.direction === 'up' ? '#C6FF3D' : trend.direction === 'down' ? '#FF8A7A' : '#8A7F76';
  const arrow = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '▬';
  const label = trend.deltaPct === null ? 'нов.' : `${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct}%`;
  return (
    <span
      className="rounded-chip px-2 py-0.5 font-mono text-[11px] font-semibold"
      style={{ color, background: `${color}1A` }}
      title="к предыдущему периоду"
    >
      {arrow} {label}
    </span>
  );
}

interface DashboardViewProps {
  d: Dashboard | null;
  risks: RiskSignal[];
  revenue: { day: string; amount: number }[];
  trend: RevenueTrend | null;
  period: number;
  onPeriod: (days: number) => void;
  onSignal: (kind: string) => void;
}

/** Owner overview: KPIs, revenue chart (7/30/custom range) with trend, and the risk feed. */
export function DashboardView({ d, risks, revenue, trend, period, onPeriod, onSignal }: DashboardViewProps) {
  const [range, setRange] = useState<RevenueRange | null>(null);
  const [picker, setPicker] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const custom = range !== null;
  const data = custom ? range.buckets : revenue.length ? revenue : (d?.revenue7d ?? []);
  const max = Math.max(1, ...data.map((r) => r.amount));
  const total = custom ? range.total : data.reduce((s, b) => s + b.amount, 0);
  const dayCount = custom ? range.days : period;

  function selectPeriod(p: number) {
    setRange(null);
    setPicker(false);
    onPeriod(p);
  }

  async function applyRange() {
    if (!from || !to) {
      setErr('Укажите обе даты');
      return;
    }
    try {
      setErr(null);
      const r = await fetchRevenueRange(from, to);
      setRange(r);
      setPicker(false);
    } catch {
      setErr('Неверный диапазон (макс. 366 дней, from ≤ to)');
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label="Продажи" value={d ? som(d.money.salesGross) : '…'} />
        <Metric label="Чистыми" value={d ? som(d.money.net) : '…'} color="#C6FF3D" />
        <Metric label="Заказов" value={d ? String(d.orders.total) : '…'} />
        <Metric label="На одобрении" value={d ? String(d.ops.pendingApprovals) : '…'} color={d && d.ops.pendingApprovals > 0 ? '#E5B23C' : '#fff'} />
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-display text-[15px] font-bold">Выручка · {som(total)}</span>
            {!custom && <TrendBadge trend={trend} />}
            {custom && (
              <span className="rounded-chip bg-[#221E19] px-2 py-0.5 font-mono text-[11px] text-[#A79C92]">
                {range.from} → {range.to} · {range.days} дн
              </span>
            )}
            <div className="ml-auto flex gap-1">
              {[7, 30].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectPeriod(p)}
                  className={`rounded-chip px-2.5 py-1 text-[11px] font-semibold transition ${
                    !custom && period === p ? 'bg-lime text-lime-ink' : 'bg-[#221E19] text-[#A79C92] hover:text-white'
                  }`}
                >
                  {p} дн
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPicker((v) => !v)}
                className={`rounded-chip px-2.5 py-1 text-[11px] font-semibold transition ${
                  custom ? 'bg-lime text-lime-ink' : 'bg-[#221E19] text-[#A79C92] hover:text-white'
                }`}
              >
                Период
              </button>
            </div>
          </div>

          {picker && (
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[12px] border border-[#2E2822] bg-[#221E19] p-3">
              <label className="flex flex-col gap-1 text-[11px] text-[#8A7F76]">
                С
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-[8px] border border-[#3A342E] bg-[#16130F] px-2 py-1 text-[13px] text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[#8A7F76]">
                По
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-[8px] border border-[#3A342E] bg-[#16130F] px-2 py-1 text-[13px] text-white"
                />
              </label>
              <button
                type="button"
                onClick={applyRange}
                className="rounded-chip bg-lime px-3 py-1.5 text-[12px] font-bold text-lime-ink"
              >
                Применить
              </button>
              {err && <span className="text-[11px] text-[#FF8A7A]">{err}</span>}
            </div>
          )}

          <div className="flex h-40 items-end gap-1">
            {data.map((b, i) => (
              <div key={b.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t-sm bg-gradient-to-b from-[#C6FF3D] to-[#8FD40F]"
                  style={{ height: `${Math.max(3, (b.amount / max) * 150)}px` }}
                  title={`${b.day}: ${som(b.amount)}`}
                />
                <span className="text-[9px] text-[#8A7F76]">
                  {dayCount <= 7
                    ? new Date(b.day).toLocaleDateString('ru-RU', { weekday: 'short' })
                    : i % Math.ceil(data.length / 6) === 0 ? b.day.slice(5) : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3.5 font-display text-[15px] font-bold">Требуют решения</div>
          {risks.length === 0 && <p className="text-sm text-[#8A7F76]">✓ Тревог нет</p>}
          {risks.slice(0, 5).map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSignal(r.kind)}
              className="mb-3 block w-full border-l-[3px] pl-3 text-left transition hover:opacity-80"
              style={{ borderColor: SEV_COLOR[r.severity] }}
            >
              <div className="text-[13px] leading-snug text-white">{r.detail}</div>
              <div className="mt-0.5 font-mono text-[11px]" style={{ color: SEV_COLOR[r.severity] }}>{r.severity} · перейти →</div>
            </button>
          ))}
        </Card>
      </div>
    </>
  );
}
