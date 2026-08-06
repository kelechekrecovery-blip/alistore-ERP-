"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDescriptionMessages = buildDescriptionMessages;
exports.buildDescription = buildDescription;
const HIGHLIGHT_KEYS = [
    'память',
    'memory',
    'storage',
    'озу',
    'ram',
    'экран',
    'display',
    'screen',
    'цвет',
    'color',
    'процессор',
    'chip',
    'cpu',
    'камера',
    'camera',
    'аккумулятор',
    'battery',
];
const isScalar = (v) => typeof v === 'string' || typeof v === 'number';
function buildDescriptionMessages(input) {
    const system = [
        'Ты — копирайтер магазина электроники в Кыргызстане. Напиши краткое продающее описание',
        'товара на русском (2–3 предложения, без markdown, без выдуманных характеристик —',
        'только на основе переданных данных). Не указывай цену.',
    ].join(' ');
    const payload = { name: input.name, category: input.category ?? null, attrs: input.attrs ?? {} };
    return [
        { role: 'system', content: system },
        { role: 'user', content: `Данные товара (JSON):\n${JSON.stringify(payload)}` },
    ];
}
function buildDescription(input) {
    const attrs = input.attrs ?? {};
    const highlights = [];
    for (const key of HIGHLIGHT_KEYS) {
        const hit = Object.keys(attrs).find((k) => k.toLowerCase() === key);
        if (hit && isScalar(attrs[hit]) && !highlights.some((h) => h.startsWith(`${hit}:`))) {
            highlights.push(`${hit}: ${attrs[hit]}`);
        }
        if (highlights.length >= 4)
            break;
    }
    if (highlights.length < 4) {
        for (const [k, v] of Object.entries(attrs)) {
            if (highlights.length >= 4)
                break;
            if (isScalar(v) && !highlights.some((h) => h.startsWith(`${k}:`)))
                highlights.push(`${k}: ${v}`);
        }
    }
    const catPart = input.category ? ` из категории «${input.category}»` : '';
    const specPart = highlights.length ? ` Ключевые характеристики — ${highlights.join(', ')}.` : '';
    const description = `${input.name}${catPart} — доступен в AliStore.${specPart} ` +
        'Гарантия 12 месяцев, доставка по Бишкеку за 1–2 часа и самовывоз в день заказа.';
    return { description, source: 'template', highlights };
}
//# sourceMappingURL=describe.js.map