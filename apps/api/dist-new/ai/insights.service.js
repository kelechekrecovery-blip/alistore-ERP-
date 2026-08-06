"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var InsightsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsService = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("../reports/reports.service");
const insight_provider_1 = require("./insight-provider");
const openrouter_provider_1 = require("./openrouter-provider");
const llm_factory_1 = require("./llm/llm.factory");
const tool_budget_1 = require("./tool-budget");
const pricing_service_1 = require("./pricing.service");
const reorder_service_1 = require("./reorder.service");
const CONTEXT_LIST_LIMIT = 25;
const EMPTY_TOOL_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };
let InsightsService = InsightsService_1 = class InsightsService {
    constructor(reports, pricing, reorder) {
        this.reports = reports;
        this.pricing = pricing;
        this.reorder = reorder;
        this.logger = new common_1.Logger(InsightsService_1.name);
        this.fallback = new insight_provider_1.RuleInsightProvider();
        this.client = (0, llm_factory_1.resolveLlmClient)();
        if (this.client)
            this.logger.log(`AI insights provider: ${this.client.source}`);
    }
    async insights() {
        const ctx = await this.buildContext();
        if (!this.client)
            return { source: this.fallback.source, insights: await this.fallback.generate(ctx) };
        try {
            return { source: this.client.source, insights: await this.generateWithLlm(this.client, ctx) };
        }
        catch (err) {
            this.logger.warn(`AI provider «${this.client.source}» failed, using rule fallback: ${String(err)}`);
            return { source: `${this.fallback.source} (fallback)`, insights: await this.fallback.generate(ctx) };
        }
    }
    async generateWithLlm(client, ctx) {
        const agentic = envFlag('AI_ASSISTANT_TOOLS') && client.supportsTools;
        if (agentic) {
            const res = await client.chat([{ role: 'user', content: insight_provider_1.ASSISTANT_TASK }], {
                system: insight_provider_1.ASSISTANT_SYSTEM,
                cacheSystem: true,
                tools: this.buildTools(),
                maxTokens: 1200,
            });
            return (0, openrouter_provider_1.parseInsightsResponse)(res.text);
        }
        const [system, user] = (0, openrouter_provider_1.buildInsightMessages)(ctx);
        if (client.supportsStructuredOutput) {
            const res = await client.chat([{ role: 'user', content: user.content }], {
                system: system.content,
                cacheSystem: true,
                jsonSchema: insight_provider_1.INSIGHT_SCHEMA,
                maxTokens: 800,
            });
            return (0, insight_provider_1.coerceInsights)(res.parsed);
        }
        const res = await client.chat([{ role: 'user', content: user.content }], { system: system.content });
        return (0, openrouter_provider_1.parseInsightsResponse)(res.text);
    }
    buildTools() {
        const tool = (name, description, run) => ({
            name,
            description,
            inputSchema: EMPTY_TOOL_SCHEMA,
            run: async () => (0, tool_budget_1.serializeToolResult)(await run()),
        });
        return [
            tool('get_kpi', 'KPI: маржа, средний чек, оплаченные заказы, топ-товары и продавцы.', () => this.reports.kpi()),
            tool('get_dashboard', 'Дашборд: деньги (net/refunds) и операционные метрики.', () => this.reports.dashboard()),
            tool('get_risks', 'Список текущих рисков из Event Ledger.', () => this.reports.risks()),
            tool('get_pricing_review', 'Рекомендации по ценам (наценка/скидка/затоварка).', () => this.pricing.review()),
            tool('get_reorder_review', 'Рекомендации по закупкам/дефициту склада.', () => this.reorder.review()),
        ];
    }
    async buildContext() {
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
            risks: risksRes.signals
                .slice(0, CONTEXT_LIST_LIMIT)
                .map((s) => ({ kind: s.kind, severity: s.severity, detail: s.detail })),
            reorderUrgent: { count: urgent.length, names: urgent.slice(0, CONTEXT_LIST_LIMIT).map((r) => r.name) },
            overstock: { count: overstockItems.length, topName: overstockItems[0]?.name ?? null },
        };
    }
};
exports.InsightsService = InsightsService;
exports.InsightsService = InsightsService = InsightsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        pricing_service_1.PricingService,
        reorder_service_1.ReorderService])
], InsightsService);
function envFlag(name) {
    const v = process.env[name]?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}
//# sourceMappingURL=insights.service.js.map