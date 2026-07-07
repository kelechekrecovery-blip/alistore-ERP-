import { Injectable, Logger } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { InsightContext, InsightProvider, RuleInsightProvider } from './insight-provider';
import { OpenRouterInsightProvider } from './openrouter-provider';
import { PricingService } from './pricing.service';
import { ReorderService } from './reorder.service';

/**
 * Owner AI assistant (Phase 11). Builds an insight context from the same ledger-backed
 * reports the dashboard uses, then delegates to an InsightProvider. Ships with the
 * keyless rule provider; when AI_PROVIDER_KEY is configured a hosted LLM provider is
 * selected instead — and it falls back to rules if the provider is unreachable, so the
 * endpoint never fails just because the AI API is down.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  private readonly provider: InsightProvider;
  private readonly fallback = new RuleInsightProvider();

  constructor(
    private readonly reports: ReportsService,
    private readonly pricing: PricingService,
    private readonly reorder: ReorderService,
  ) {
    // A real LLM provider is wired when a server-side key exists (never in the client).
    // OpenRouter = one key, any model (override the default via AI_MODEL). Until a key is
    // set — and whenever the provider errors at request time — the deterministic rules run.
    const key = process.env.AI_PROVIDER_KEY ?? process.env.OPENROUTER_API_KEY;
    this.provider = key
      ? new OpenRouterInsightProvider({ apiKey: key, model: process.env.AI_MODEL })
      : this.fallback;
    if (key) this.logger.log(`AI insights provider: ${this.provider.source}`);
  }

  async insights() {
    const [dashboard, kpi, risksRes, pricing, reorder] = await Promise.all([
      this.reports.dashboard(),
      this.reports.kpi(),
      this.reports.risks(),
      this.pricing.review(),
      this.reorder.review(),
    ]);

    const urgent = reorder.reviews.filter((r) => r.urgency === 'high');
    const overstockItems = pricing.reviews.filter((r) => r.action === 'discount');

    const ctx: InsightContext = {
      marginPct: kpi.marginPct,
      grossMargin: kpi.grossMargin,
      avgCheck: kpi.avgCheck,
      paidOrders: kpi.paidOrders,
      topProduct: kpi.topProducts[0]
        ? { name: kpi.topProducts[0].name, revenue: kpi.topProducts[0].revenue }
        : null,
      topSeller: kpi.sellers[0]
        ? { staffId: kpi.sellers[0].staffId, revenue: kpi.sellers[0].revenue }
        : null,
      net: dashboard.money.net,
      refunds: dashboard.money.refunds,
      pendingApprovals: dashboard.ops.pendingApprovals,
      risks: risksRes.signals.map((s) => ({ kind: s.kind, severity: s.severity, detail: s.detail })),
      reorderUrgent: { count: urgent.length, names: urgent.map((r) => r.name) },
      overstock: { count: overstockItems.length, topName: overstockItems[0]?.name ?? null },
    };

    let source = this.provider.source;
    let insights;
    try {
      insights = await this.provider.generate(ctx);
    } catch (err) {
      this.logger.warn(`AI provider «${source}» failed, using rule fallback: ${String(err)}`);
      insights = await this.fallback.generate(ctx);
      source = `${this.fallback.source} (fallback)`;
    }
    return { source, insights };
  }
}
