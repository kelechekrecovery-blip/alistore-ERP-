import { buildInsights, Insight } from './insight';

/** Aggregates handed to a provider — everything comes from the Event Ledger tables. */
export interface InsightContext {
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
  reorderUrgent?: { count: number; names: string[] };
  overstock?: { count: number; topName: string | null };
}

/**
 * The AI-layer port (Phase 11). Owner insights are produced behind this interface so
 * the source can be swapped — a keyless rule engine today, a hosted LLM once a provider
 * key is configured — without changing callers. Keys live server-side only.
 */
export interface InsightProvider {
  readonly source: string;
  generate(ctx: InsightContext): Promise<Insight[]>;
}

/** Keyless deterministic provider — always available, no external calls. */
export class RuleInsightProvider implements InsightProvider {
  readonly source = 'rules';
  async generate(ctx: InsightContext): Promise<Insight[]> {
    return buildInsights(ctx);
  }
}
