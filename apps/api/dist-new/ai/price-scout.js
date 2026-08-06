"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRICE_SCOUT_SCHEMA = void 0;
exports.scoutPriceByRules = scoutPriceByRules;
exports.buildPriceScoutMessages = buildPriceScoutMessages;
exports.parsePriceScoutResponse = parsePriceScoutResponse;
function round100(n) {
    return Math.max(0, Math.round(n / 100) * 100);
}
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[idx];
}
function filteredListingPrices(input) {
    const raw = (input.observedListings ?? [])
        .map((l) => l.price)
        .filter((price) => Number.isFinite(price) && price > 0);
    if (raw.length === 0)
        return [];
    const min = input.basePrice * 0.45;
    const max = input.basePrice * 1.65;
    const filtered = raw.filter((price) => price >= min && price <= max);
    return (filtered.length > 0 ? filtered : raw).sort((a, b) => a - b);
}
function scoutPriceByRules(input) {
    const prices = filteredListingPrices(input);
    const signals = [`catalog_anchor:${input.basePrice}`];
    let marketLow;
    let marketMedian;
    let marketHigh;
    let confidence;
    if (prices.length > 0) {
        marketLow = percentile(prices, 0.25);
        marketMedian = percentile(prices, 0.5);
        marketHigh = percentile(prices, 0.75);
        confidence = prices.length >= 5 ? 0.78 : prices.length >= 3 ? 0.68 : 0.55;
        signals.push(`manual_listings:${prices.length}`);
    }
    else {
        marketLow = input.basePrice * 0.82;
        marketMedian = input.basePrice * 0.92;
        marketHigh = input.basePrice * 1.02;
        confidence = 0.42;
        signals.push('no_external_listings');
    }
    const recommendedPrice = round100(Math.min(marketHigh, Math.max(marketLow, marketMedian * 0.98)));
    const notes = [
        prices.length > 0
            ? 'Рекомендация основана на ручных listing-ценах и каталожном якоре.'
            : 'Нет внешних listing-цен; используйте как внутренний ориентир до подключения market scout.',
    ];
    if (recommendedPrice < input.basePrice * 0.75)
        notes.push('Рынок заметно ниже каталога; проверьте комплектацию/состояние.');
    if (recommendedPrice > input.basePrice * 1.1)
        notes.push('Рынок выше каталога; проверьте дефицит и актуальность базовой цены.');
    return {
        source: 'rules',
        marketLow: round100(marketLow),
        marketMedian: round100(marketMedian),
        marketHigh: round100(marketHigh),
        recommendedPrice,
        confidence,
        signals,
        notes,
    };
}
function buildPriceScoutMessages(input) {
    return [
        {
            role: 'system',
            content: [
                'Ты — market scout AliStore для электроники в Кыргызстане.',
                'Оцени рыночный коридор цены по переданным данным, не придумывай источники.',
                'Верни СТРОГО JSON-объект {"marketLow","marketMedian","marketHigh","recommendedPrice","confidence","signals","notes"}.',
                'Все цены в сомах, confidence 0..1.',
            ].join(' '),
        },
        { role: 'user', content: JSON.stringify(input) },
    ];
}
function parsePriceScoutResponse(content) {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start)
        throw new Error('no JSON object in price scout response');
    const raw = JSON.parse(content.slice(start, end + 1));
    const nums = ['marketLow', 'marketMedian', 'marketHigh', 'recommendedPrice'];
    for (const key of nums) {
        if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))
            throw new Error(`invalid ${key}`);
    }
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
    return {
        marketLow: round100(raw.marketLow),
        marketMedian: round100(raw.marketMedian),
        marketHigh: round100(raw.marketHigh),
        recommendedPrice: round100(raw.recommendedPrice),
        confidence: Math.round(confidence * 100) / 100,
        signals: Array.isArray(raw.signals) ? raw.signals.filter((v) => typeof v === 'string').slice(0, 12) : [],
        notes: Array.isArray(raw.notes) ? raw.notes.filter((v) => typeof v === 'string').slice(0, 8) : [],
    };
}
exports.PRICE_SCOUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        marketLow: { type: 'number' },
        marketMedian: { type: 'number' },
        marketHigh: { type: 'number' },
        recommendedPrice: { type: 'number' },
        confidence: { type: 'number' },
        signals: { type: 'array', items: { type: 'string' } },
        notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['marketLow', 'marketMedian', 'marketHigh', 'recommendedPrice', 'confidence', 'signals', 'notes'],
};
//# sourceMappingURL=price-scout.js.map