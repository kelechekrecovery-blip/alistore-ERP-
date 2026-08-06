"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSISTANT_TASK = exports.ASSISTANT_SYSTEM = exports.INSIGHT_SCHEMA = exports.RuleInsightProvider = void 0;
exports.coerceInsights = coerceInsights;
const insight_1 = require("./insight");
class RuleInsightProvider {
    constructor() {
        this.source = 'rules';
    }
    async generate(ctx) {
        return (0, insight_1.buildInsights)(ctx);
    }
}
exports.RuleInsightProvider = RuleInsightProvider;
const TONES = new Set(['positive', 'warning', 'info']);
exports.INSIGHT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        insights: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    tone: { type: 'string', enum: ['positive', 'warning', 'info'] },
                    title: { type: 'string' },
                    detail: { type: 'string' },
                },
                required: ['tone', 'title', 'detail'],
            },
        },
    },
    required: ['insights'],
};
function coerceInsights(parsed) {
    const list = parsed && typeof parsed === 'object' ? parsed.insights : undefined;
    if (!Array.isArray(list))
        throw new Error('structured insights missing "insights" array');
    const out = [];
    for (const raw of list) {
        if (!raw || typeof raw !== 'object')
            continue;
        const item = raw;
        if (typeof item.title !== 'string' || typeof item.detail !== 'string')
            continue;
        const tone = typeof item.tone === 'string' && TONES.has(item.tone) ? item.tone : 'info';
        out.push({ tone, title: item.title.slice(0, 120), detail: item.detail.slice(0, 300) });
        if (out.length >= 8)
            break;
    }
    if (out.length === 0)
        throw new Error('no valid insights in structured reply');
    return out;
}
exports.ASSISTANT_SYSTEM = [
    'Ты — AI-ассистент владельца магазина электроники в Кыргызстане (валюта — сом).',
    'У тебя есть инструменты для получения свежих цифр из Event Ledger (KPI, риски, цены, закупки).',
    'Вызывай нужные инструменты, затем дай краткие деловые инсайты.',
    'Приоритет: маржа, дефицит/затоварка склада, критичные риски, возвраты, лучшие товары/продавцы.',
    'Итог верни СТРОГО как JSON-массив объектов {"tone","title","detail"}, tone ∈ {"positive","warning","info"},',
    'до 6 элементов, без markdown и текста вне JSON. title — до 8 слов, detail — одно предложение с конкретным действием.',
].join(' ');
exports.ASSISTANT_TASK = 'Проанализируй текущее состояние магазина и верни главные инсайты для владельца. Используй инструменты для получения актуальных данных.';
//# sourceMappingURL=insight-provider.js.map