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
    | 'imei_reuse'
    | 'repeat_returns'
    | 'discount_frequency'
    | 'write_off_spike';
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

export interface RepeatReturnRisk {
  customerId: string;
  customerName: string;
  count: number;
}

export interface DiscountFrequencyRisk {
  staffId: string;
  discountedSales: number;
  totalSales: number;
  sharePct: number;
}

export interface WriteOffSpike {
  currentQty: number;
  previousQty: number;
  currentCount: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Customers with more than three return requests in the rolling 30-day input window. */
export function computeRepeatReturns(
  orders: { customerId: string; customerName?: string | null }[],
  threshold = 3,
): RepeatReturnRisk[] {
  const grouped = new Map<string, RepeatReturnRisk>();
  for (const order of orders) {
    const current = grouped.get(order.customerId) ?? {
      customerId: order.customerId,
      customerName: order.customerName?.trim() || order.customerId,
      count: 0,
    };
    current.count += 1;
    grouped.set(order.customerId, current);
  }
  return [...grouped.values()].filter((row) => row.count > threshold).sort((a, b) => b.count - a.count);
}

/** Staff whose discounted POS receipt share is above the Risk Center's 30% rule. */
export function computeDiscountFrequency(
  sales: { staffId: string; gross: number; total: number }[],
  thresholdPct = 30,
): DiscountFrequencyRisk[] {
  const grouped = new Map<string, { discountedSales: number; totalSales: number }>();
  for (const sale of sales) {
    const current = grouped.get(sale.staffId) ?? { discountedSales: 0, totalSales: 0 };
    current.totalSales += 1;
    if (sale.gross > 0 && sale.total < sale.gross) current.discountedSales += 1;
    grouped.set(sale.staffId, current);
  }
  return [...grouped.entries()]
    .map(([staffId, row]) => ({
      staffId,
      ...row,
      sharePct: Math.round((row.discountedSales / row.totalSales) * 100),
    }))
    .filter((row) => row.sharePct > thresholdPct)
    .sort((a, b) => b.sharePct - a.sharePct);
}

/** Compare approved write-offs in the latest seven days with the preceding seven days. */
export function computeWriteOffSpike(
  movements: { qty: number; createdAt: Date }[],
  now: Date,
  minimumCurrentQty = 3,
): WriteOffSpike | null {
  let currentQty = 0;
  let previousQty = 0;
  let currentCount = 0;
  for (const movement of movements) {
    const age = now.getTime() - movement.createdAt.getTime();
    if (age < 0 || age >= WEEK_MS * 2) continue;
    const qty = Math.abs(movement.qty);
    if (age < WEEK_MS) {
      currentQty += qty;
      currentCount += 1;
    } else {
      previousQty += qty;
    }
  }
  if (currentQty < minimumCurrentQty || currentQty <= previousQty) return null;
  return { currentQty, previousQty, currentCount };
}

/**
 * Paid lines priced under their product cost, worst example per SKU, capped. Pure —
 * the caller supplies the paid items and the product cost table.
 */
export function computeMarginLeaks(
  paidItems: { sku: string; price: number }[],
  products: { sku: string; name: string; cost: number }[],
  cap = 10,
): MarginLeak[] {
  const costBySku = new Map(products.map((p) => [p.sku, p]));
  const worstBySku = new Map<string, MarginLeak>();
  for (const item of paidItems) {
    const product = costBySku.get(item.sku);
    if (!product || item.price >= product.cost) continue;
    const prev = worstBySku.get(item.sku);
    if (!prev || item.price < prev.price) {
      worstBySku.set(item.sku, { sku: item.sku, name: product.name, price: item.price, cost: product.cost });
    }
  }
  return [...worstBySku.values()].slice(0, cap);
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
  repeatReturns: RepeatReturnRisk[];
  discountFrequency: DiscountFrequencyRisk[];
  writeOffSpike: WriteOffSpike | null;
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

  for (const row of input.repeatReturns) {
    signals.push({
      kind: 'repeat_returns',
      severity: 'high',
      ref: row.customerId,
      detail: `Клиент ${row.customerName}: ${row.count} возврата за 30 дней`,
    });
  }

  for (const row of input.discountFrequency) {
    signals.push({
      kind: 'discount_frequency',
      severity: 'high',
      ref: row.staffId,
      detail: `Сотрудник ${row.staffId}: ${row.discountedSales}/${row.totalSales} чеков со скидкой (${row.sharePct}%)`,
    });
  }

  if (input.writeOffSpike) {
    signals.push({
      kind: 'write_off_spike',
      severity: 'medium',
      ref: 'inventory',
      detail: `Списания выросли: ${input.writeOffSpike.currentQty} шт. за 7 дней против ${input.writeOffSpike.previousQty} ранее`,
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
