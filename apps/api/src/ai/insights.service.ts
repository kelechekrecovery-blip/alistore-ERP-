import { Injectable, Logger } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import {
  ASSISTANT_SYSTEM,
  ASSISTANT_TASK,
  coerceInsights,
  INSIGHT_SCHEMA,
  InsightContext,
  RuleInsightProvider,
} from './insight-provider';
import { Insight } from './insight';
import { buildInsightMessages, parseInsightsResponse } from './openrouter-provider';
import type { LlmClient, LlmToolDef } from './llm/llm-client';
import { resolveLlmClient } from './llm/llm.factory';
import { PricingService } from './pricing.service';
import { ReorderService } from './reorder.service';

const EMPTY_TOOL_SCHEMA: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false };

/**
 * Owner AI assistant (Phase 11). Builds an insight context from the same ledger-backed
 * reports the dashboard uses, then produces insights through the configured LLM provider.
 *
 * Three modes, chosen by capability and the `AI_ASSISTANT_TOOLS` flag:
 *   - Agentic (Claude + tools): the model pulls KPI/risks/pricing/reorder signals itself.
 *   - Structured (Claude): one-shot with a JSON schema and a cached system prefix.
 *   - Text (OpenRouter): one-shot with the tolerant array parser.
 * Any provider error falls back to the deterministic rule engine, so the endpoint never
 * fails just because the AI API is down. Keys stay server-side.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  private readonly fallback = new RuleInsightProvider();
  private readonly client: LlmClient | null;

  constructor(
    private readonly reports: ReportsService,
    private readonly pricing: PricingService,
    private readonly reorder: ReorderService,
  ) {
    this.client = resolveLlmClient();
    if (this.client) this.logger.log(`AI insights provider: ${this.client.source}`);
  }

  async insights() {
    const ctx = await this.buildContext();
    if (!this.client) return { source: this.fallback.source, insights: await this.fallback.generate(ctx) };

    try {
      return { source: this.client.source, insights: await this.generateWithLlm(this.client, ctx) };
    } catch (err) {
      this.logger.warn(`AI provider «${this.client.source}» failed, using rule fallback: ${String(err)}`);
      return { source: `${this.fallback.source} (fallback)`, insights: await this.fallback.generate(ctx) };
    }
  }

  private async generateWithLlm(client: LlmClient, ctx: InsightContext): Promise<Insight[]> {
    const agentic = envFlag('AI_ASSISTANT_TOOLS') && client.supportsTools;
    if (agentic) {
      const res = await client.chat([{ role: 'user', content: ASSISTANT_TASK }], {
        system: ASSISTANT_SYSTEM,
        cacheSystem: true,
        tools: this.buildTools(),
        maxTokens: 1200,
      });
      return parseInsightsResponse(res.text);
    }

    const [system, user] = buildInsightMessages(ctx);
    if (client.supportsStructuredOutput) {
      const res = await client.chat([{ role: 'user', content: user.content }], {
        system: system.content,
        cacheSystem: true,
        jsonSchema: INSIGHT_SCHEMA,
        maxTokens: 800,
      });
      return coerceInsights(res.parsed);
    }

    const res = await client.chat([{ role: 'user', content: user.content }], { system: system.content });
    return parseInsightsResponse(res.text);
  }

  /** Tools the agentic assistant can call — each returns a fresh ledger-backed slice. */
  private buildTools(): LlmToolDef[] {
    const tool = (name: string, description: string, run: () => Promise<unknown>): LlmToolDef => ({
      name,
      description,
      inputSchema: EMPTY_TOOL_SCHEMA,
      run: async () => JSON.stringify(await run()),
    });
    return [
      tool('get_kpi', 'KPI: маржа, средний чек, оплаченные заказы, топ-товары и продавцы.', () => this.reports.kpi()),
      tool('get_dashboard', 'Дашборд: деньги (net/refunds) и операционные метрики.', () => this.reports.dashboard()),
      tool('get_risks', 'Список текущих рисков из Event Ledger.', () => this.reports.risks()),
      tool('get_pricing_review', 'Рекомендации по ценам (наценка/скидка/затоварка).', () => this.pricing.review()),
      tool('get_reorder_review', 'Рекомендации по закупкам/дефициту склада.', () => this.reorder.review()),
    ];
  }

  private async buildContext(): Promise<InsightContext> {
    const [dashboard, kpi, risksRes, pricing, reorder] = await Promise.all([
      this.reports.dashboard(),
      this.reports.kpi(),
      this.reports.risks(),
      this.pricing.review(),
      this.reorder.review(),
    ]);

    const urgent = reorder.reviews.filter((r) => r.urgency === 'high');
    const overstockItems = pricing.reviews.filter((r) => r.action === 'discount');

    return {
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
  }
}

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
