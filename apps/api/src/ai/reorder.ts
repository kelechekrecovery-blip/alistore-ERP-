export type ReorderUrgency = 'high' | 'medium' | 'low' | 'none';

export interface ReorderInput {
  inStock: number; // units on hand (available)
  reserved: number; // units held against open orders
  soldUnits: number; // lifetime sold (demand signal)
}

export interface ReorderRec {
  needsReorder: boolean;
  urgency: ReorderUrgency;
  suggestedQty: number;
  reason: string;
}

/**
 * Rule-based restock recommendation (Phase 11, keyless) — the understock mirror of
 * suggestPrice. Flags SKUs that are out/low on hand while demand exists and proposes a
 * quantity that covers observed demand. Pure — a forecasting LLM plugs in behind the
 * same port when a key is set. Read-only advice; никаких заказов не создаёт.
 */
export function suggestReorder(input: ReorderInput): ReorderRec {
  const { inStock, reserved, soldUnits } = input;
  const coverTarget = Math.max(2, soldUnits); // restock to at least cover observed demand
  const gap = Math.max(1, coverTarget - inStock);

  if (inStock === 0 && soldUnits >= 1) {
    return {
      needsReorder: true,
      urgency: 'high',
      suggestedQty: coverTarget,
      reason: 'Нет в наличии при живом спросе — срочно дозаказать.',
    };
  }
  if (inStock <= 2 && soldUnits >= 3) {
    return {
      needsReorder: true,
      urgency: 'high',
      suggestedQty: gap,
      reason: 'Почти закончился при высоком спросе — пополнить.',
    };
  }
  if (inStock <= 2 && soldUnits >= 1) {
    return {
      needsReorder: true,
      urgency: 'medium',
      suggestedQty: gap,
      reason: 'Остаток заканчивается — пора пополнить.',
    };
  }
  if (reserved > inStock && soldUnits >= 1) {
    return {
      needsReorder: true,
      urgency: 'medium',
      suggestedQty: Math.max(1, reserved - inStock),
      reason: 'Резервов больше, чем на складе — не хватит под заказы.',
    };
  }
  return { needsReorder: false, urgency: 'none', suggestedQty: 0, reason: 'Запаса достаточно.' };
}
