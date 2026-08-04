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
  // --- Партнёрские рассрочки -------------------------------------------------
  //
  // Витрина показывает «от N сом/мес» на карточке товара. Цифра считается на
  // сервере (`catalog/installments.ts`) по этим параметрам — придумывать
  // финансовое условие в вёрстке нельзя.
  //
  // Проверено по открытым источникам: Payda — Оптима Банк, до 3 месяцев, лимит
  // 100 000 сом; рассрочка O!Market — O!Bank, до 12 месяцев; ZERO — А Банк,
  // лимит 200 000 сом. Все три работают по 0% и БЕЗ наценки для магазина:
  // магазин получает полную сумму сразу. Публичного API или виджета для
  // интернет-магазина нет ни у одной — витрина показывает условие и ведёт
  // покупателя в нужный канал, а не оформляет рассрочку онлайн.
  //
  // `months = 0` выключает провайдера. По умолчанию выключены те, чей срок в
  // открытых источниках не опубликован: показывать срок, которого мы не знаем,
  // значит обещать наугад. Владелец выставляет их из своего договора.
  {
    key: 'installment.payda.months',
    label: 'Payda · срок рассрочки',
    group: 'credit',
    kind: 'int',
    fallback: 3,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'Оптима Банк. 0 — не показывать. На сайте банка заявлено до 3 месяцев.',
    source: 'открытые условия Оптима Банка (payda)',
  },
  {
    key: 'installment.payda.markup_bps',
    label: 'Payda · наценка магазина',
    group: 'credit',
    kind: 'bps',
    fallback: 0,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: 'Ваша наценка поверх цены. 0 — покупатель платит ровно цену товара.',
    source: 'коммерческое решение владельца',
  },
  {
    key: 'installment.payda.limit_som',
    label: 'Payda · потолок суммы',
    group: 'credit',
    kind: 'int',
    fallback: 100_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: '0 — без ограничения. Товар дороже потолка не покажет эту рассрочку.',
    source: 'открытые условия Оптима Банка (payda)',
  },
  {
    key: 'installment.omarket.months',
    label: 'O!Market · срок рассрочки',
    group: 'credit',
    kind: 'int',
    fallback: 12,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'O!Bank. 0 — не показывать. Публично заявлено до 12 месяцев под 0%.',
    source: 'открытые условия O!Bank',
  },
  {
    key: 'installment.omarket.markup_bps',
    label: 'O!Market · наценка магазина',
    group: 'credit',
    kind: 'bps',
    fallback: 0,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: 'Ваша наценка поверх цены. 0 — покупатель платит ровно цену товара.',
    source: 'коммерческое решение владельца',
  },
  {
    key: 'installment.omarket.limit_som',
    label: 'O!Market · потолок суммы',
    group: 'credit',
    kind: 'int',
    fallback: 0,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: '0 — без ограничения. Потолок в открытых источниках не опубликован.',
    source: 'открытые условия O!Bank',
  },
  {
    key: 'installment.zero.months',
    label: 'ZERO · срок рассрочки',
    group: 'credit',
    kind: 'int',
    fallback: 0,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'А Банк. Срок в открытых источниках не опубликован — поставьте из договора, иначе не показываем.',
    source: 'открытые условия zero.kg',
  },
  {
    key: 'installment.zero.markup_bps',
    label: 'ZERO · наценка магазина',
    group: 'credit',
    kind: 'bps',
    fallback: 0,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: 'Ваша наценка поверх цены. 0 — покупатель платит ровно цену товара.',
    source: 'коммерческое решение владельца',
  },
  {
    key: 'installment.zero.limit_som',
    label: 'ZERO · потолок суммы',
    group: 'credit',
    kind: 'int',
    fallback: 200_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: '0 — без ограничения. Публично заявлен лимит 200 000 сом.',
    source: 'открытые условия zero.kg',
  },
  {
    key: 'installment.mplus.months',
    label: 'M+ · срок рассрочки',
    group: 'credit',
    kind: 'int',
    fallback: 0,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'Провайдер в открытых источниках не подтверждён. Поставьте срок из договора, иначе не показываем.',
    source: 'договор магазина',
  },
  {
    key: 'installment.mplus.markup_bps',
    label: 'M+ · наценка магазина',
    group: 'credit',
    kind: 'bps',
    fallback: 0,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: 'Ваша наценка поверх цены. 0 — покупатель платит ровно цену товара.',
    source: 'коммерческое решение владельца',
  },
  {
    key: 'installment.mplus.limit_som',
    label: 'M+ · потолок суммы',
    group: 'credit',
    kind: 'int',
    fallback: 0,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: '0 — без ограничения.',
    source: 'договор магазина',
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
