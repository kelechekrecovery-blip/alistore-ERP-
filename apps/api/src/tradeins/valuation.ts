/**
 * Сколько магазин платит за выкупаемое устройство.
 *
 * Считает сервер, и только сервер. Раньше сумму считала страница выкупа:
 * семистрочная таблица моделей и множитель состояния жили в браузере, а
 * `POST /tradeins` принимал получившееся число как есть — и оно попадало в
 * договор, в проводки главной книги и в движение кассы. То есть выплату
 * назначал тот, кто её получает. Здесь та же таблица, но как параметр
 * настроек, а результат вычисляется на сервере и клиентскому числу не верит.
 */
export const TRADE_IN_GRADES = ['A', 'B', 'C'] as const;
export type TradeInGrade = (typeof TRADE_IN_GRADES)[number];

/** Ступень оценки: подстрока модели (в нижнем регистре) и база в сомах. */
export interface TradeInTier {
  match: string;
  baseSom: number;
}

export interface TradeInValuation {
  /** Порядок значим: побеждает первое совпадение, как в прайсе у владельца. */
  tiers: TradeInTier[];
  defaultBaseSom: number;
  gradeFactorsBps: Record<TradeInGrade, number>;
  /** Шаг округления итога, сомы. `0` — не округлять. */
  roundToSom: number;
}

export function tradeInEstimate(
  model: string,
  grade: TradeInGrade,
  valuation: TradeInValuation,
): number {
  const normalized = model.trim().toLocaleLowerCase('ru');
  if (!normalized) return 0;

  const tier = valuation.tiers.find(
    (item) => item.match.trim() !== '' && normalized.includes(item.match.trim().toLocaleLowerCase('ru')),
  );
  const base = tier ? tier.baseSom : valuation.defaultBaseSom;
  const factorBps = valuation.gradeFactorsBps[grade];
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(factorBps) || factorBps <= 0) return 0;

  const raw = (base * factorBps) / 10_000;
  const step = Number.isFinite(valuation.roundToSom) && valuation.roundToSom > 0 ? valuation.roundToSom : 0;
  // Округление к ближайшему шагу — так считала прежняя страница, и менять
  // направление здесь нельзя: это коммерческое условие, а не арифметика.
  // Захотите округлять вниз в пользу магазина — это правка настроек и цены,
  // а не рефакторинг.
  const rounded = step > 0 ? Math.round(raw / step) * step : Math.round(raw);
  return Math.max(0, rounded);
}
