export type PriceAction = 'raise' | 'hold' | 'discount';

export interface PriceInput {
  basePrice: number;
  inStock: number; // units on hand
  soldUnits: number; // lifetime sold (demand signal)
}

export interface PriceRec {
  current: number;
  suggested: number;
  deltaPct: number; // signed, %
  action: PriceAction;
  reason: string;
}

const round100 = (n: number): number => Math.max(0, Math.round(n / 100) * 100);

/**
 * Rule-based dynamic-pricing recommendation (Phase 11, keyless). Balances stock on hand
 * against demand (sold units): scarce+wanted → nudge up; overstocked+cold → discount to
 * move it. Pure — a market-scouting LLM plugs in behind the same port when a key is set.
 */
export function suggestPrice(input: PriceInput): PriceRec {
  const { basePrice, inStock, soldUnits } = input;
  let deltaPct = 0;
  let action: PriceAction = 'hold';
  let reason = 'Баланс спроса и остатка — цена оптимальна.';

  if (inStock <= 2 && soldUnits >= 3) {
    deltaPct = 5;
    action = 'raise';
    reason = 'Дефицит при высоком спросе — можно поднять цену.';
  } else if (inStock >= 10 && soldUnits === 0) {
    deltaPct = -10;
    action = 'discount';
    reason = 'Затоварка без продаж — скидка разгонит оборот.';
  } else if (soldUnits === 0 && inStock >= 5) {
    deltaPct = -5;
    action = 'discount';
    reason = 'Медленно движется — лёгкая скидка поможет.';
  } else if (inStock >= 8 && soldUnits <= 1) {
    deltaPct = -5;
    action = 'discount';
    reason = 'Много на складе, спрос слабый.';
  }

  const suggested = round100(basePrice * (1 + deltaPct / 100));
  return { current: basePrice, suggested, deltaPct, action, reason };
}
