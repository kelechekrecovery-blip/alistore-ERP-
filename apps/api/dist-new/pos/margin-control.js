"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saleTotal = saleTotal;
exports.evaluateMarginControl = evaluateMarginControl;
function saleTotal(lines, discountPct) {
    const gross = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
    return Math.round(gross * (1 - discountPct / 100));
}
function evaluateMarginControl(lines, discountPct, minMargin) {
    const gross = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
    const total = saleTotal(lines, discountPct);
    const discountAmount = gross - total;
    const margins = lines.map((line) => Math.round(line.price * (1 - discountPct / 100)) - line.cost);
    const worstMargin = margins.length ? Math.min(...margins) : 0;
    const breaches = lines
        .map((line, index) => {
        const discountedPrice = Math.round(line.price * (1 - discountPct / 100));
        const margin = margins[index] ?? 0;
        return { line, discountedPrice, margin };
    })
        .filter(({ margin }) => margin < minMargin)
        .map(({ line, discountedPrice, margin }) => ({
        productId: line.productId,
        sku: line.sku,
        qty: line.qty,
        price: line.price,
        cost: line.cost,
        discountedPrice,
        margin,
        minMargin,
    }));
    return {
        gross,
        total,
        discountAmount,
        minMargin,
        worstMargin,
        breaches,
        fingerprint: marginFingerprint(lines, discountPct, minMargin),
    };
}
function marginFingerprint(lines, discountPct, minMargin) {
    const normalized = lines
        .map((line) => ({
        productId: line.productId,
        sku: line.sku,
        qty: line.qty,
        price: line.price,
        cost: line.cost,
        costRef: line.costRef ?? null,
    }))
        .sort((a, b) => `${a.productId}:${a.sku}:${a.price}:${a.qty}:${a.cost}:${a.costRef}`.localeCompare(`${b.productId}:${b.sku}:${b.price}:${b.qty}:${b.cost}:${b.costRef}`));
    return JSON.stringify({ discountPct, minMargin, lines: normalized });
}
//# sourceMappingURL=margin-control.js.map