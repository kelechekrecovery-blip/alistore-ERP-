"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORIZE_SYSTEM = exports.CATEGORIZE_SCHEMA = exports.CATEGORY_NAMES = void 0;
exports.suggestCategory = suggestCategory;
exports.buildCategorizeMessages = buildCategorizeMessages;
exports.coerceCategorySuggestion = coerceCategorySuggestion;
const RULES = [
    { category: 'Смартфоны', keywords: ['iphone', 'galaxy', 'samsung', 'pixel', 'redmi', 'xiaomi', 'смартфон', 'phone', 'телефон'] },
    { category: 'Ноутбуки', keywords: ['macbook', 'ноутбук', 'laptop', 'thinkpad', 'zenbook', 'notebook'] },
    { category: 'Планшеты', keywords: ['ipad', 'планшет', 'tab', 'tablet'] },
    { category: 'Аудио', keywords: ['airpods', 'наушник', 'headphone', 'buds', 'audio', 'колонк', 'speaker', 'jbl'] },
    { category: 'Часы', keywords: ['watch', 'часы', 'band', 'смарт-часы'] },
];
function suggestCategory(name, attrs = {}) {
    const hay = [name, ...Object.values(attrs).filter((v) => typeof v === 'string')]
        .join(' ')
        .toLowerCase();
    const scored = RULES.map((r) => {
        const matched = r.keywords.filter((k) => hay.includes(k));
        return { category: r.category, score: matched.length, matched };
    }).sort((a, b) => b.score - a.score);
    const top = scored[0];
    const totalHits = scored.reduce((s, x) => s + x.score, 0);
    if (!top || top.score === 0) {
        return { category: 'Разное', confidence: 0, matched: [], alternatives: [] };
    }
    return {
        category: top.category,
        confidence: Math.round((top.score / totalHits) * 100) / 100,
        matched: top.matched,
        alternatives: scored.filter((x) => x !== top && x.score > 0).map((x) => ({ category: x.category, score: x.score })),
    };
}
exports.CATEGORY_NAMES = [...RULES.map((r) => r.category), 'Разное'];
exports.CATEGORIZE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        category: { type: 'string', enum: exports.CATEGORY_NAMES },
        confidence: { type: 'number' },
        matched: { type: 'array', items: { type: 'string' } },
        alternatives: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: { category: { type: 'string', enum: exports.CATEGORY_NAMES }, score: { type: 'number' } },
                required: ['category', 'score'],
            },
        },
    },
    required: ['category', 'confidence', 'matched', 'alternatives'],
};
exports.CATEGORIZE_SYSTEM = [
    'Ты классифицируешь товары магазина электроники по фиксированному списку категорий:',
    `${exports.CATEGORY_NAMES.join(', ')}.`,
    'Верни строгую категорию из списка, confidence 0..1, matched — слова/признаки из названия и атрибутов,',
    'на основании которых выбрана категория, и alternatives — другие вероятные категории со score 0..1.',
    'Если товар не подходит ни под одну — категория «Разное». Не выдумывай категорий вне списка.',
].join(' ');
function buildCategorizeMessages(name, attrs = {}) {
    return [{ role: 'user', content: `Товар (JSON):\n${JSON.stringify({ name, attrs })}` }];
}
function coerceCategorySuggestion(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return null;
    const raw = parsed;
    if (typeof raw.category !== 'string' || !exports.CATEGORY_NAMES.includes(raw.category))
        return null;
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
    const matched = Array.isArray(raw.matched) ? raw.matched.filter((v) => typeof v === 'string').slice(0, 12) : [];
    const alternatives = Array.isArray(raw.alternatives)
        ? raw.alternatives
            .map((a) => (a && typeof a === 'object' ? a : null))
            .filter((a) => a !== null)
            .filter((a) => typeof a.category === 'string' && exports.CATEGORY_NAMES.includes(a.category))
            .map((a) => ({ category: a.category, score: typeof a.score === 'number' ? a.score : 0 }))
            .slice(0, 4)
        : [];
    return { category: raw.category, confidence: Math.round(confidence * 100) / 100, matched, alternatives };
}
//# sourceMappingURL=categorize.js.map