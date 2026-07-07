export interface PayrollConfig {
  base: number; // fixed base pay per period, сом
  commissionPct: number; // % of attributed revenue (оборот)
}

/** Default comp model — a fixed base plus a commission on turnover. Configurable. */
export const DEFAULT_PAYROLL: PayrollConfig = { base: 15000, commissionPct: 1.5 };

export interface SellerInput {
  staffId: string;
  revenue: number; // received payments taken by this seller (via shift)
  sales: number; // number of payments taken
}

export interface PayrollRow extends SellerInput {
  base: number;
  commission: number;
  total: number; // base + commission
}

export interface Payroll {
  base: number;
  commissionPct: number;
  rows: PayrollRow[];
  totalPayout: number; // sum of all seller totals
}

/**
 * Seller payroll (Phase 9): base + commission on turnover, per seller. Pure — the
 * caller supplies the seller aggregation so the figures never diverge from the
 * payments the ledger recorded. Advisory calc; issues no payments.
 */
export function buildPayroll(sellers: SellerInput[], cfg: PayrollConfig = DEFAULT_PAYROLL): Payroll {
  const rows: PayrollRow[] = sellers
    .map((s) => {
      const commission = Math.round((s.revenue * cfg.commissionPct) / 100);
      return { ...s, base: cfg.base, commission, total: cfg.base + commission };
    })
    .sort((a, b) => b.total - a.total);

  const totalPayout = rows.reduce((sum, r) => sum + r.total, 0);
  return { base: cfg.base, commissionPct: cfg.commissionPct, rows, totalPayout };
}
