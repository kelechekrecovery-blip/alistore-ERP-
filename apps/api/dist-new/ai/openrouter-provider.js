"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterInsightProvider = void 0;
exports.buildInsightMessages = buildInsightMessages;
exports.parseInsightsResponse = parseInsightsResponse;
exports.openRouterChat = openRouterChat;
const TONES = new Set(['positive', 'warning', 'info']);
function buildInsightMessages(ctx) {
    const system = [
        'Ты — AI-ассистент владельца магазина электроники в Кыргызстане (валюта — сом).',
        'На основе ТОЛЬКО предоставленных цифр из Event Ledger дай краткие деловые инсайты.',
        'Отвечай на русском. Верни СТРОГО JSON-массив объектов {"tone","title","detail"},',
        'где tone ∈ {"positive","warning","info"}, до 6 элементов, без markdown и текста вне JSON.',
        'Приоритет: маржа, дефицит/затоварка склада, критичные риски, возвраты, лучшие товары/продавцы.',
        'title — короткий (до 8 слов), detail — одно предложение с конкретным действием.',
    ].join(' ');
    return [
        { role: 'system', content: system },
        { role: 'user', content: `Цифры (JSON):\n${JSON.stringify(ctx)}` },
    ];
}
function parseInsightsResponse(content) {
    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start)
        throw new Error('no JSON array in LLM response');
    const parsed = JSON.parse(content.slice(start, end + 1));
    if (!Array.isArray(parsed))
        throw new Error('LLM response is not an array');
    const out = [];
    for (const raw of parsed) {
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
        throw new Error('no valid insights in LLM response');
    return out;
}
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;
async function openRouterChat(messages, cfg) {
    const model = cfg.model ?? DEFAULT_MODEL;
    const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.apiKey}`,
                'X-Title': 'AliStore ERP',
            },
            body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 800 }),
            signal: controller.signal,
        });
        if (!res.ok)
            throw new Error(`openrouter responded ${res.status}`);
        const data = (await res.json());
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string')
            throw new Error('openrouter response has no content');
        return content;
    }
    finally {
        clearTimeout(timer);
    }
}
class OpenRouterInsightProvider {
    constructor(opts) {
        this.opts = opts;
        this.model = opts.model ?? DEFAULT_MODEL;
        this.source = `openrouter:${this.model}`;
    }
    async generate(ctx) {
        const content = await openRouterChat(buildInsightMessages(ctx), this.opts);
        return parseInsightsResponse(content);
    }
}
exports.OpenRouterInsightProvider = OpenRouterInsightProvider;
//# sourceMappingURL=openrouter-provider.js.map