"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TERM_LADDER = void 0;
exports.installmentOffers = installmentOffers;
exports.installmentLadder = installmentLadder;
exports.bestInstallmentOffer = bestInstallmentOffer;
exports.TERM_LADDER = [3, 6, 12];
function installmentOffers(priceSom, plans) {
    if (!Number.isFinite(priceSom) || priceSom <= 0)
        return [];
    return plans
        .filter((plan) => plan.maxMonths > 0)
        .filter((plan) => plan.limitSom <= 0 || priceSom <= plan.limitSom)
        .flatMap((plan) => {
        const totalSom = Math.round(priceSom * (1 + Math.max(0, plan.markupBps) / 10_000));
        return exports.TERM_LADDER
            .filter((months) => months <= plan.maxMonths)
            .filter((months) => totalSom >= months)
            .map((months) => ({
            id: plan.id,
            label: plan.label,
            months,
            monthlySom: Math.ceil(totalSom / months),
            totalSom,
        }));
    })
        .filter((offer) => offer.monthlySom > 0 && offer.monthlySom < offer.totalSom)
        .sort((a, b) => a.monthlySom - b.monthlySom || b.months - a.months);
}
function installmentLadder(priceSom, plans) {
    const byMonths = new Map();
    for (const offer of installmentOffers(priceSom, plans)) {
        const step = byMonths.get(offer.months);
        if (!step) {
            byMonths.set(offer.months, { months: offer.months, monthlySom: offer.monthlySom, providers: [offer.label] });
            continue;
        }
        if (offer.monthlySom < step.monthlySom) {
            step.monthlySom = offer.monthlySom;
            step.providers = [offer.label];
        }
        else if (offer.monthlySom === step.monthlySom && !step.providers.includes(offer.label)) {
            step.providers.push(offer.label);
        }
    }
    return [...byMonths.values()].sort((a, b) => a.monthlySom - b.monthlySom || b.months - a.months);
}
function bestInstallmentOffer(priceSom, plans) {
    return installmentOffers(priceSom, plans)[0] ?? null;
}
//# sourceMappingURL=installments.js.map