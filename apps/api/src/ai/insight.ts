export type InsightTone = 'positive' | 'warning' | 'info';

export interface Insight {
  tone: InsightTone;
  title: string;
  detail: string;
}

/** Margin below this reads as a warning for an electronics retailer. */
const HEALTHY_MARGIN_PCT = 12;

interface InsightInput {
  marginPct: number;
  grossMargin: number;
  avgCheck: number;
  paidOrders: number;
  topProduct: { name: string; revenue: number } | null;
  topSeller: { staffId: string; revenue: number } | null;
  net: number;
  refunds: number;
  pendingApprovals: number;
  risks: { kind: string; severity: string; detail: string }[];
}

/**
 * Rule-based owner insights derived from ledger-backed figures. This is the keyless
 * fallback for the AI layer (Phase 11): it always works offline; a real LLM provider
 * plugs in behind the same InsightProvider port for richer narrative when a key is set.
 * Pure — the caller supplies the aggregates.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];

  // margin health
  if (input.paidOrders > 0) {
    if (input.marginPct < HEALTHY_MARGIN_PCT) {
      out.push({
        tone: 'warning',
        title: `Низкая маржа: ${input.marginPct}%`,
        detail: `Валовая маржа ниже ${HEALTHY_MARGIN_PCT}% — проверьте закупочные цены и скидки.`,
      });
    } else {
      out.push({
        tone: 'positive',
        title: `Здоровая маржа: ${input.marginPct}%`,
        detail: `Валовая прибыль ${fmt(input.grossMargin)} сом · средний чек ${fmt(input.avgCheck)} сом.`,
      });
    }
  }

  // top product
  if (input.topProduct) {
    out.push({
      tone: 'info',
      title: `Лидер продаж: ${input.topProduct.name}`,
      detail: `Выручка ${fmt(input.topProduct.revenue)} сом — держите его в наличии и на витрине.`,
    });
  }

  // top seller
  if (input.topSeller) {
    out.push({
      tone: 'positive',
      title: `Лучший продавец: ${input.topSeller.staffId}`,
      detail: `Принёс ${fmt(input.topSeller.revenue)} сом — кандидат на бонус.`,
    });
  }

  // refunds pressure
  if (input.net > 0 && input.refunds > input.net * 0.15) {
    out.push({
      tone: 'warning',
      title: 'Высокая доля возвратов',
      detail: `Возвраты ${fmt(input.refunds)} сом — разберите причины в Dispute/Returns.`,
    });
  }

  // pending approvals
  if (input.pendingApprovals > 0) {
    out.push({
      tone: 'warning',
      title: `На одобрении: ${input.pendingApprovals}`,
      detail: 'Опасные действия ждут решения — откройте Approval Inbox.',
    });
  }

  // risks
  const high = input.risks.filter((r) => r.severity === 'high');
  if (high.length > 0) {
    out.push({
      tone: 'warning',
      title: `${high.length} критичных тревог`,
      detail: high[0].detail + (high.length > 1 ? ` (+${high.length - 1})` : ''),
    });
  } else if (input.risks.length === 0) {
    out.push({ tone: 'positive', title: 'Всё сходится', detail: 'Тревог в Risk Center нет.' });
  }

  return out;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}
