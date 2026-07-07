import {
  Approval,
  CashShift,
  CourierRun,
  DebtPlan,
  SupplierRma,
  SupportTicket,
  WarrantyCase,
} from '@prisma/client';
import { COD_STALE_MS } from './reports.service';

export type RiskSeverity = 'high' | 'medium' | 'low';

export interface RiskSignal {
  kind:
    | 'cash_discrepancy'
    | 'cod_outstanding'
    | 'stale_reservations'
    | 'pending_approval'
    | 'warranty_sla_breach'
    | 'rma_sla_breach'
    | 'debt_overdue'
    | 'ticket_sla_breach'
    | 'margin_leak'
    | 'stock_money_mismatch'
    | 'imei_reuse';
  severity: RiskSeverity;
  ref: string;
  detail: string;
}

/** A paid line sold below its product cost — a margin leak worth investigating. */
export interface MarginLeak {
  sku: string;
  name: string;
  price: number;
  cost: number;
}

interface RiskInputs {
  cashDiscrepancies: CashShift[];
  codOutstanding: CourierRun[];
  staleReservations: number;
  pendingApprovals: Approval[];
  warrantyOverdue: WarrantyCase[];
  rmaOverdue: SupplierRma[];
  debtsOverdue: DebtPlan[];
  ticketsOverdue: SupportTicket[];
  marginLeaks: MarginLeak[]; // paid items sold under cost
  soldWithoutOrderImeis: string[]; // IMEIs of units marked sold with no order (stock≠money)
  imeiReuse: string[]; // IMEIs that appear both in a trade-in and among sold units (fraud)
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

  for (const r of input.rmaOverdue) {
    signals.push({
      kind: 'rma_sla_breach',
      severity: 'medium',
      ref: r.id,
      detail: `RMA поставщику по ${r.imei} просрочена (${r.status})`,
    });
  }

  for (const d of input.debtsOverdue) {
    signals.push({
      kind: 'debt_overdue',
      severity: 'high',
      ref: d.id,
      detail: `Просрочен долг: остаток ${d.balance} сом (клиент ${d.customerId})`,
    });
  }

  for (const t of input.ticketsOverdue) {
    signals.push({
      kind: 'ticket_sla_breach',
      severity: t.priority === 'urgent' ? 'high' : 'medium',
      ref: t.id,
      detail: `Тикет «${t.subject}» просрочил SLA (${t.priority}/${t.status})`,
    });
  }

  // Margin leak: a paid line sold below product cost (loss-making sale).
  for (const m of input.marginLeaks) {
    signals.push({
      kind: 'margin_leak',
      severity: 'medium',
      ref: m.sku,
      detail: `Продажа ниже себестоимости: ${m.name} за ${m.price} при закупке ${m.cost} сом`,
    });
  }

  // IMEI reuse: the same IMEI shows up both in a buyback and among sold units — a classic
  // used-device swap/laundering pattern that warrants a manual check.
  for (const imei of input.imeiReuse) {
    signals.push({
      kind: 'imei_reuse',
      severity: 'high',
      ref: imei,
      detail: `IMEI ${imei} есть и в скупке Б/У, и среди проданных — проверьте на подмену`,
    });
  }

  // Stock≠money: a unit left inventory (sold) without an order to back it.
  if (input.soldWithoutOrderImeis.length > 0) {
    const sample = input.soldWithoutOrderImeis.slice(0, 3).join(', ');
    signals.push({
      kind: 'stock_money_mismatch',
      severity: 'high',
      ref: input.soldWithoutOrderImeis[0],
      detail: `Продано без заказа (склад≠деньги): ${input.soldWithoutOrderImeis.length} юнит(ов) — ${sample}`,
    });
  }

  const rank: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
