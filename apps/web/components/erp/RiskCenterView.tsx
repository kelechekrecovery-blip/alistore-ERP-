'use client';

import type { RiskSignal } from '@/lib/reports';
import { Card } from './Card';

type Severity = 'high' | 'medium' | 'low';

const SEV_META: Record<Severity, { label: string; color: string; order: number }> = {
  high: { label: 'Высокий', color: '#FF8A7A', order: 0 },
  medium: { label: 'Средний', color: '#E5B23C', order: 1 },
  low: { label: 'Низкий', color: '#8A7F76', order: 2 },
};

/** Human-readable label, icon and business area for each risk signal kind. */
const KIND_META: Record<string, { label: string; icon: string; area: string }> = {
  cash_discrepancy: { label: 'Касса не сходится', icon: '💵', area: 'Деньги' },
  cod_outstanding: { label: 'COD не сдан', icon: '🚚', area: 'Деньги' },
  debt_overdue: { label: 'Просрочен долг', icon: '💳', area: 'Деньги' },
  margin_leak: { label: 'Продажа ниже себестоимости', icon: '📉', area: 'Маржа' },
  stock_money_mismatch: { label: 'Склад ≠ деньги', icon: '⚠️', area: 'Склад' },
  stale_reservations: { label: 'Зависший резерв', icon: '⏳', area: 'Склад' },
  imei_reuse: { label: 'Подмена IMEI', icon: '🔁', area: 'Fraud' },
  warranty_sla_breach: { label: 'Гарантия · SLA', icon: '🛡', area: 'Сервис' },
  rma_sla_breach: { label: 'RMA поставщику · SLA', icon: '📦', area: 'Сервис' },
  ticket_sla_breach: { label: 'Тикет · SLA', icon: '💬', area: 'Сервис' },
  pending_approval: { label: 'Ждёт одобрения', icon: '✋', area: 'Процессы' },
};

const SEV_ORDER: Severity[] = ['high', 'medium', 'low'];

function meta(kind: string) {
  return KIND_META[kind] ?? { label: kind, icon: '•', area: '—' };
}

/**
 * Risk / Command Center: the owner's single pane of anomalies from the Event Ledger —
 * money, stock, margin, fraud, SLA and pending approvals. Signals are grouped by severity
 * with a summary header; each row jumps to the screen that resolves it (Command Center).
 */
export function RiskCenterView({
  risks,
  onSignal,
}: {
  risks: RiskSignal[];
  onSignal: (kind: string) => void;
}) {
  const counts = { high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  for (const r of risks) counts[r.severity as Severity] = (counts[r.severity as Severity] ?? 0) + 1;

  if (risks.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="text-4xl">✓</div>
          <div className="font-display text-lg font-bold text-lime">Тревог нет — всё сходится</div>
          <div className="text-sm text-[#8A7F76]">
            Касса, COD, резервы, маржа, склад, SLA и долги в норме по Event Ledger.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* summary header */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#8A7F76]">Центр рисков</div>
            <div className="mt-1 font-display text-2xl font-extrabold">
              {risks.length} {risks.length === 1 ? 'сигнал' : 'сигналов'} требуют внимания
            </div>
            <div className="mt-1 text-sm text-[#A79C92]">Кликните по сигналу — переход на экран решения.</div>
          </div>
          <div className="grid min-w-[280px] grid-cols-3 gap-2 text-center">
            {SEV_ORDER.map((sev) => (
              <div key={sev} className="rounded-[10px] border border-[#2E2822] bg-[#221E19] p-3">
                <div className="font-display text-2xl font-extrabold" style={{ color: SEV_META[sev].color }}>
                  {counts[sev]}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-[#8A7F76]">{SEV_META[sev].label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* grouped signals */}
      {SEV_ORDER.filter((sev) => counts[sev] > 0).map((sev) => (
        <Card key={sev}>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_META[sev].color }} />
            <span className="font-display text-[15px] font-bold text-white">{SEV_META[sev].label} приоритет</span>
            <span className="ml-auto rounded-chip bg-[#221E19] px-2.5 py-0.5 text-xs font-semibold text-[#D8CFC6]">
              {counts[sev]}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {risks
              .filter((r) => r.severity === sev)
              .map((r, i) => {
                const m = meta(r.kind);
                return (
                  <li key={`${r.kind}-${i}`}>
                    <button
                      type="button"
                      onClick={() => onSignal(r.kind)}
                      className="flex w-full items-center gap-3 rounded-[10px] border border-[#2E2822] bg-[#221E19] px-3 py-2.5 text-left transition hover:border-[#3A342E]"
                    >
                      <span className="text-lg">{m.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{m.label}</span>
                          <span className="rounded-chip bg-[#16130F] px-2 py-0.5 text-[10px] font-semibold text-[#8A7F76]">
                            {m.area}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#A79C92]">{r.detail}</span>
                      </span>
                      <span className="text-[#6E645C]">→</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
