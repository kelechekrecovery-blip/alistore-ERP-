"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUYBACK_OF_RESALE = void 0;
exports.assessDevice = assessDevice;
const AGE_DEPREC_PER_MONTH = 0.03;
const AGE_FLOOR = 0.2;
const GRADE_FACTOR = { A: 1.0, B: 0.82, C: 0.6 };
const DEFECT_PENALTY = {
    screen: 0.15,
    battery: 0.1,
    body: 0.08,
    water: 0.25,
    camera: 0.1,
};
const DEFECT_CAP = 0.5;
exports.DEFAULT_BUYBACK_OF_RESALE = 0.7;
const round100 = (n) => Math.max(0, Math.round(n / 100) * 100);
function assessDevice(input, buybackOfResale = exports.DEFAULT_BUYBACK_OF_RESALE) {
    const age = Math.max(AGE_FLOOR, 1 - Math.max(0, input.ageMonths) * AGE_DEPREC_PER_MONTH);
    const grade = GRADE_FACTOR[input.grade] ?? GRADE_FACTOR.C;
    const defect = Math.min(DEFECT_CAP, input.defects.reduce((sum, d) => sum + (DEFECT_PENALTY[d] ?? 0.05), 0));
    const resale = round100(input.basePrice * age * grade * (1 - defect));
    const buyback = round100(resale * buybackOfResale);
    const notes = [];
    if (input.ageMonths >= 24)
        notes.push('Старше 2 лет — спрос ниже, закладывайте запас на скидку.');
    if (defect >= 0.25)
        notes.push('Существенные дефекты — предложите ремонт до перепродажи.');
    if (input.grade === 'A' && input.ageMonths <= 6)
        notes.push('Почти новое (A, ≤6 мес) — приоритет на витрину.');
    return {
        basePrice: input.basePrice,
        resale,
        buyback,
        retainedPct: input.basePrice > 0 ? Math.round((resale / input.basePrice) * 100) : 0,
        factors: { age: Math.round(age * 100) / 100, grade, defect: Math.round(defect * 100) / 100 },
        notes,
    };
}
//# sourceMappingURL=valuation.js.map