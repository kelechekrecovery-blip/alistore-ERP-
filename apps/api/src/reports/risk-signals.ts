import { Approval, CashShift, CourierRun, WarrantyCase } from '@prisma/client';
import { COD_STALE_MS } from './reports.service';

export type RiskSeverity = 'high' | 'medium' | 'low';

export interface RiskSignal {
  kind:
    | 'cash_discrepancy'
    | 'cod_outstanding'
    | 'stale_reservations'
    | 'pending_approval'
    | 'warranty_sla_breach';
  severity: RiskSeverity;
  ref: string;
  detail: string;
}

interface RiskInputs {
  cashDiscrepancies: CashShift[];
  codOutstanding: CourierRun[];
  staleReservations: number;
  pendingApprovals: Approval[];
  warrantyOverdue: WarrantyCase[];
}

/** Normalize raw risk rows into a single ranked signal list (high → low). */
export function buildRiskSignals(input: RiskInputs, now: Date): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const s of input.cashDiscrepancies) {
    signals.push({
      kind: 'cash_discrepancy',
      severity: 'high',
      ref: s.id,
      detail: `Касса ${s.point}: расхождение ${s.diff} сом`,
    });
  }

  for (const c of input.codOutstanding) {
    const stale = now.getTime() - c.createdAt.getTime() > COD_STALE_MS;
    signals.push({
      kind: 'cod_outstanding',
      severity: stale ? 'high' : 'medium',
      ref: c.id,
      detail: `Курьер ${c.courierId}: COD ${c.codTotal} сом не сдан${stale ? ' (>24ч)' : ''}`,
    });
  }

  if (input.staleReservations > 0) {
    signals.push({
      kind: 'stale_reservations',
      severity: 'medium',
      ref: '—',
      detail: `Зависших резервов (истёк срок): ${input.staleReservations}`,
    });
  }

  for (const a of input.pendingApprovals) {
    signals.push({
      kind: 'pending_approval',
      severity: 'medium',
      ref: a.id,
      detail: `Ожидает одобрения: ${a.action} — ${a.reason}`,
    });
  }

  for (const w of input.warrantyOverdue) {
    signals.push({
      kind: 'warranty_sla_breach',
      severity: 'high',
      ref: w.id,
      detail: `Гарантия ${w.imei} просрочила SLA (${w.status})`,
    });
  }

  const rank: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
