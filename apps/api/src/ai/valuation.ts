export type DeviceGrade = 'A' | 'B' | 'C';

export interface ValuationInput {
  basePrice: number; // price of the equivalent new unit
  grade: DeviceGrade; // cosmetic/functional grade
  ageMonths: number; // months since release/purchase
  defects: string[]; // known issues (screen, battery, body, water, camera…)
}

export interface Valuation {
  basePrice: number;
  resale: number; // fair used resale price
  buyback: number; // what the store should pay the seller
  retainedPct: number; // resale / basePrice, %
  factors: { age: number; grade: number; defect: number }; // multipliers/penalty applied
  notes: string[];
}

const AGE_DEPREC_PER_MONTH = 0.03; // 3% per month
const AGE_FLOOR = 0.2; // never below 20% of new from age alone
const GRADE_FACTOR: Record<DeviceGrade, number> = { A: 1.0, B: 0.82, C: 0.6 };
const DEFECT_PENALTY: Record<string, number> = {
  screen: 0.15,
  battery: 0.1,
  body: 0.08,
  water: 0.25,
  camera: 0.1,
};
const DEFECT_CAP = 0.5; // total defect penalty capped at 50%
/**
 * Доля выкупа от цены перепродажи по умолчанию. Владелец меняет её в настройках
 * (`tradein.buyback_of_resale_pct`) и передаёт параметром — модуль чистый.
 */
export const DEFAULT_BUYBACK_OF_RESALE = 0.7;

const round100 = (n: number): number => Math.max(0, Math.round(n / 100) * 100);

/**
 * Rule-based used-device valuation (Phase 11, keyless). Depreciates the new price by
 * age, grade and known defects, then derives a buyback price that preserves margin.
 * Pure — a vision/LLM provider can later grade from photos behind the same port.
 */
export function assessDevice(input: ValuationInput, buybackOfResale: number = DEFAULT_BUYBACK_OF_RESALE): Valuation {
  const age = Math.max(AGE_FLOOR, 1 - Math.max(0, input.ageMonths) * AGE_DEPREC_PER_MONTH);
  const grade = GRADE_FACTOR[input.grade] ?? GRADE_FACTOR.C;
  const defect = Math.min(
    DEFECT_CAP,
    input.defects.reduce((sum, d) => sum + (DEFECT_PENALTY[d] ?? 0.05), 0),
  );

  const resale = round100(input.basePrice * age * grade * (1 - defect));
  const buyback = round100(resale * buybackOfResale);

  const notes: string[] = [];
  if (input.ageMonths >= 24) notes.push('Старше 2 лет — спрос ниже, закладывайте запас на скидку.');
  if (defect >= 0.25) notes.push('Существенные дефекты — предложите ремонт до перепродажи.');
  if (input.grade === 'A' && input.ageMonths <= 6) notes.push('Почти новое (A, ≤6 мес) — приоритет на витрину.');

  return {
    basePrice: input.basePrice,
    resale,
    buyback,
    retainedPct: input.basePrice > 0 ? Math.round((resale / input.basePrice) * 100) : 0,
    factors: { age: Math.round(age * 100) / 100, grade, defect: Math.round(defect * 100) / 100 },
    notes,
  };
}
