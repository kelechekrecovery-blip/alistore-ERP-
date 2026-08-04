import { ValidationError } from '../common/errors';

/**
 * The catalogue of business parameters the owner may change without a deploy.
 *
 * Each entry keeps the value that used to be a TypeScript literal, so the code
 * that reads it behaves identically until somebody changes it deliberately. The
 * `source` field records where the constant lived, which makes the migration of
 * the remaining constants mechanical rather than archaeological.
 */
export interface SettingDefinition {
  key: string;
  label: string;
  group: 'discounts' | 'payroll' | 'warranty' | 'tradein' | 'loyalty' | 'credit';
  kind: 'int' | 'percent' | 'bps';
  /** The literal this parameter replaces — the value in force before any edit. */
  fallback: number;
  min: number;
  max: number;
  unit: string;
  hint: string;
  source: string;
}

export const SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'discount.approval_threshold_pct',
    label: 'Скидка, требующая согласования',
    group: 'discounts',
    kind: 'percent',
    fallback: 10,
    min: 0,
    max: 100,
    unit: '%',
    hint: 'Продажа со скидкой больше этой уходит на согласование.',
    source: 'rbac/permissions.ts APPROVAL_THRESHOLDS.discountPct',
  },
  {
    key: 'discount.price_change_threshold_pct',
    label: 'Изменение цены, требующее согласования',
    group: 'discounts',
    kind: 'percent',
    fallback: 15,
    min: 0,
    max: 100,
    unit: '%',
    hint: 'Изменение каталожной цены больше этого идёт через approval.',
    source: 'rbac/permissions.ts APPROVAL_THRESHOLDS.priceChangePct',
  },
  {
    key: 'discount.min_margin_som',
    label: 'Минимальная маржа на единицу',
    group: 'discounts',
    kind: 'int',
    fallback: 0,
    min: 0,
    max: 1_000_000,
    unit: 'сом',
    hint: 'Ниже этой маржи продажа уходит на согласование. Ноль означает, что продажа ровно по себестоимости проходит без спроса.',
    source: 'rbac/permissions.ts APPROVAL_THRESHOLDS.minMarginSom',
  },
  {
    key: 'payroll.base_amount_som',
    label: 'Базовый оклад за период',
    group: 'payroll',
    kind: 'int',
    fallback: 15_000,
    min: 0,
    max: 10_000_000,
    unit: 'сом',
    hint: 'Пока действует для всех сотрудников одинаково — персональные ставки это отдельная задача.',
    source: 'hr/hr.service.ts PAYROLL_CONFIG.baseAmount',
  },
  {
    key: 'payroll.commission_bps',
    label: 'Комиссия с оборота',
    group: 'payroll',
    kind: 'bps',
    fallback: 150,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: '150 bps = 1.5%. Считается с оборота, не с маржи — продавец, дающий скидки, зарабатывает больше.',
    source: 'hr/hr.service.ts PAYROLL_CONFIG.commissionBps',
  },
  {
    key: 'payroll.late_penalty_per_minute_som',
    label: 'Удержание за минуту опоздания',
    group: 'payroll',
    kind: 'int',
    fallback: 2,
    min: 0,
    max: 10_000,
    unit: 'сом/мин',
    hint: 'Удержания из зарплаты — частая претензия трудовой инспекции, стоит согласовать с юристом.',
    source: 'hr/hr.service.ts PAYROLL_CONFIG.latePenaltyPerMinute',
  },
  {
    key: 'payroll.overtime_per_minute_som',
    label: 'Доплата за минуту сверхурочных',
    group: 'payroll',
    kind: 'int',
    fallback: 3,
    min: 0,
    max: 10_000,
    unit: 'сом/мин',
    hint: 'Плоская ставка без коэффициентов и норм.',
    source: 'hr/hr.service.ts PAYROLL_CONFIG.overtimePayPerMinute',
  },
  {
    key: 'warranty.coverage_months',
    label: 'Гарантийный срок по умолчанию',
    group: 'warranty',
    kind: 'int',
    fallback: 12,
    min: 0,
    max: 120,
    unit: 'мес',
    hint: 'Печатается в гарантийном талоне. Сейчас один для нового и Б/У — срок у товара это отдельная задача.',
    source: 'customers/warranty-coverage.ts WARRANTY_COVERAGE_MONTHS',
  },
  {
    key: 'tradein.buyback_of_resale_pct',
    label: 'Доля цены перепродажи при выкупе',
    group: 'tradein',
    kind: 'percent',
    fallback: 70,
    min: 1,
    max: 100,
    unit: '%',
    hint: 'Ключевой параметр экономики Б/У: 70% означает 30% спреда.',
    source: 'ai/valuation.ts BUYBACK_OF_RESALE',
  },
  {
    key: 'loyalty.earn_rate_bps',
    label: 'Начисление бонусов',
    group: 'loyalty',
    kind: 'bps',
    fallback: 100,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: '100 bps = 1% от суммы покупки.',
    source: 'customers/loyalty-ledger.ts EARN_RATE_BPS',
  },
  {
    key: 'credit.debt_limit_som',
    label: 'Лимит долга без согласования',
    group: 'credit',
    kind: 'int',
    fallback: 50_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'Порог на один долг. Совокупная экспозиция клиента пока не проверяется.',
    source: 'debts/debts.service.ts DEBT_LIMIT',
  },
] as const;

const BY_KEY = new Map(SETTINGS.map((definition) => [definition.key, definition]));

export function settingDefinition(key: string): SettingDefinition {
  const definition = BY_KEY.get(key);
  if (!definition) {
    throw new ValidationError('unknown_setting', `Неизвестный параметр: ${key}`);
  }
  return definition;
}

/** Parse and range-check a stored or submitted value against its definition. */
export function parseSettingValue(definition: SettingDefinition, raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new ValidationError('invalid_setting_value', `${definition.label}: нужно целое число`);
  }
  if (parsed < definition.min || parsed > definition.max) {
    throw new ValidationError(
      'setting_out_of_range',
      `${definition.label}: допустимо от ${definition.min} до ${definition.max} ${definition.unit}`,
    );
  }
  return parsed;
}
