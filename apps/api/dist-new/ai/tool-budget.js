"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOOL_MAX_CHARS = exports.DEFAULT_TOOL_MAX_ITEMS = void 0;
exports.serializeToolResult = serializeToolResult;
exports.DEFAULT_TOOL_MAX_ITEMS = 40;
exports.DEFAULT_TOOL_MAX_CHARS = 12_000;
function serializeToolResult(value, budget = {}) {
    const maxItems = budget.maxItems ?? exports.DEFAULT_TOOL_MAX_ITEMS;
    const maxChars = budget.maxChars ?? exports.DEFAULT_TOOL_MAX_CHARS;
    const json = JSON.stringify(capArrays(value, maxItems) ?? null);
    if (json.length <= maxChars)
        return json;
    return `${json.slice(0, maxChars)}… [ОБРЕЗАНО: ответ инструмента превысил ${maxChars} символов]`;
}
function capArrays(value, maxItems) {
    if (Array.isArray(value))
        return capArray(value, maxItems);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = Array.isArray(item) ? capArray(item, maxItems) : item;
        }
        return out;
    }
    return value;
}
function capArray(items, maxItems) {
    if (items.length <= maxItems)
        return items;
    return [
        ...items.slice(0, maxItems),
        { truncated: true, shown: maxItems, total: items.length,
            note: 'Список усечён. Не делай выводов о полноте — запроси уточнение у человека.' },
    ];
}
//# sourceMappingURL=tool-budget.js.map