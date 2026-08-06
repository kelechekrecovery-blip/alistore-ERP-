"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRADE_IN_GRADES = void 0;
exports.tradeInEstimate = tradeInEstimate;
exports.TRADE_IN_GRADES = ['A', 'B', 'C'];
function tradeInEstimate(model, grade, valuation) {
    const normalized = model.trim().toLocaleLowerCase('ru');
    if (!normalized)
        return 0;
    const tier = valuation.tiers.find((item) => item.match.trim() !== '' && normalized.includes(item.match.trim().toLocaleLowerCase('ru')));
    const base = tier ? tier.baseSom : valuation.defaultBaseSom;
    const factorBps = valuation.gradeFactorsBps[grade];
    if (!Number.isFinite(base) || base <= 0)
        return 0;
    if (!Number.isFinite(factorBps) || factorBps <= 0)
        return 0;
    const raw = (base * factorBps) / 10_000;
    const step = Number.isFinite(valuation.roundToSom) && valuation.roundToSom > 0 ? valuation.roundToSom : 0;
    const rounded = step > 0 ? Math.round(raw / step) * step : Math.round(raw);
    return Math.max(0, rounded);
}
//# sourceMappingURL=valuation.js.map