import { ValidationError } from '../common/errors';

/**
 * The catalogue of business parameters the owner may change without a deploy.
 *
 * Each entry keeps the value that used to be a TypeScript literal, so the code
 * that reads it behaves identically until somebody changes it deliberately. The
 * `source` field records where the constant lived, which makes the migration of
 * the remaining constants mechanical rather than archaeological.
 */
export type SettingGroup =
  | 'discounts'
  | 'payroll'
  | 'warranty'
  | 'tradein'
  | 'loyalty'
  | 'credit'
  | 'legal';

export interface SettingDefinition {
  key: string;
  label: string;
  group: SettingGroup;
  kind: 'int' | 'percent' | 'bps' | 'url' | 'text';
  /**
   * The literal this parameter replaces — the value in force before any edit.
   *
   * Число для расчётных параметров, строка для ссылочных (`kind: 'url'`).
   * Пустая строка означает «владелец ещё не поставил»: витрина обязана молчать,
   * а не подставлять что-то от себя.
   */
  fallback: number | string;
  min: number;
  max: number;
  unit: string;
  hint: string;
  source: string;
}

/** Строковый параметр (QR провайдера, текст оферты) — не число. */
export function isTextSetting(definition: SettingDefinition): boolean {
  return definition.kind === 'url' || definition.kind === 'text';
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
  // `months` — ВЕРХНЯЯ ступень срока по договору. Доступными становятся все
  // ступени лестницы 3/6/12 до неё включительно (`catalog/installments.ts`):
  // «ZERO 3/6/12» — это 12, «M+ 3/6» — это 6. `0` выключает провайдера.
  // Карточка показывает наименьший платёж, то есть самую длинную доступную ступень;
  // остальные ступени пригодятся карточке товара.
  {
    key: 'installment.payda.months',
    label: 'Payda · верхняя ступень срока',
    group: 'credit',
    kind: 'int',
    fallback: 3,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'Оптима Банк. Доступны ступени 3/6/12 до этой включительно. На сайте банка заявлено до 3 месяцев, по промо — до 6.',
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
    label: 'O!Market · верхняя ступень срока',
    group: 'credit',
    kind: 'int',
    fallback: 12,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'O!Bank. Доступны ступени 3/6/12 до этой включительно. Публично заявлено до 12 месяцев под 0%.',
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
    label: 'ZERO · верхняя ступень срока',
    group: 'credit',
    kind: 'int',
    fallback: 12,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'А Банк. По договору 3/6/12 — доступны все ступени до этой. 0 — не показывать.',
    source: 'договор магазина (подтверждено владельцем)',
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
    label: 'M+ · верхняя ступень срока',
    group: 'credit',
    kind: 'int',
    fallback: 6,
    min: 0,
    max: 36,
    unit: 'мес',
    hint: 'По договору 3/6 — доступны все ступени до этой. 0 — не показывать.',
    source: 'договор магазина (подтверждено владельцем)',
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
  // Публичная оферта. Юридический текст пишет владелец, а не разработчик:
  // здесь реквизиты компании, которые нельзя ни выдумать, ни зашить в код.
  // Пока пусто — витрина честно говорит, что документ готовится, и оформление
  // не утверждает, будто покупатель с ним согласился.
  {
    key: 'legal.offer_text',
    label: 'Публичная оферта · текст документа',
    group: 'legal',
    kind: 'text',
    fallback: '',
    min: 0,
    max: 40_000,
    unit: '',
    hint: 'Вставьте финальный текст оферты. Пусто — документ не опубликован.',
    source: 'apps/web/app/oferta/page.tsx (шаблон с заглушками)',
  },
  // QR провайдеров рассрочки. Публичного API у Payda, O!Market, ZERO и M+ нет —
  // рассрочку оформляют в магазине по QR, который банк выдал именно этой точке.
  // Поэтому это не интеграция, а картинка: владелец загружает её в ERP, и она
  // появляется в блоке «где оформить». Пусто — блок не показывается вовсе.
  {
    key: 'installment.payda.qr_url',
    label: 'Payda · QR для оформления',
    group: 'credit',
    kind: 'url',
    fallback: '',
    min: 0,
    max: 512,
    unit: '',
    hint: 'Загрузите QR из личного кабинета Payda. Пусто — не показывать.',
    source: 'QR магазина от Optima Bank',
  },
  {
    key: 'installment.omarket.qr_url',
    label: 'O!Market · QR для оформления',
    group: 'credit',
    kind: 'url',
    fallback: '',
    min: 0,
    max: 512,
    unit: '',
    hint: 'Загрузите QR из личного кабинета O!Market. Пусто — не показывать.',
    source: 'QR магазина от O!Bank',
  },
  {
    key: 'installment.zero.qr_url',
    label: 'ZERO · QR для оформления',
    group: 'credit',
    kind: 'url',
    fallback: '',
    min: 0,
    max: 512,
    unit: '',
    hint: 'Загрузите QR из личного кабинета ZERO. Пусто — не показывать.',
    source: 'QR магазина от А Банка',
  },
  {
    key: 'installment.mplus.qr_url',
    label: 'M+ · QR для оформления',
    group: 'credit',
    kind: 'url',
    fallback: '',
    min: 0,
    max: 512,
    unit: '',
    hint: 'В M+ магазин выбирают как продавца — QR нужен, если банк его выдал.',
    source: 'QR магазина от M+',
  },
  // Выкуп Б/У. Суммы вынесены сюда, потому что раньше они лежали в браузере:
  // страница считала выплату сама и присылала её серверу, а сервер записывал
  // это число в договор и в проводки. Значения по умолчанию повторяют прежнюю
  // таблицу — цена для покупателя не меняется, меняется то, кто её назначает.
  {
    key: 'tradein.base.iphone_15_som',
    label: 'Выкуп · iPhone 15',
    group: 'tradein',
    kind: 'int',
    fallback: 65_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.iphone_14_som',
    label: 'Выкуп · iPhone 14',
    group: 'tradein',
    kind: 'int',
    fallback: 52_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.iphone_13_som',
    label: 'Выкуп · iPhone 13',
    group: 'tradein',
    kind: 'int',
    fallback: 38_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.iphone_12_som',
    label: 'Выкуп · iPhone 12',
    group: 'tradein',
    kind: 'int',
    fallback: 28_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.macbook_som',
    label: 'Выкуп · MacBook',
    group: 'tradein',
    kind: 'int',
    fallback: 70_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.ipad_som',
    label: 'Выкуп · iPad',
    group: 'tradein',
    kind: 'int',
    fallback: 32_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.airpods_som',
    label: 'Выкуп · AirPods',
    group: 'tradein',
    kind: 'int',
    fallback: 8_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'База за отличное состояние. 0 — модель не выкупаем.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.base.default_som',
    label: 'Выкуп · прочие модели',
    group: 'tradein',
    kind: 'int',
    fallback: 30_000,
    min: 0,
    max: 100_000_000,
    unit: 'сом',
    hint: 'Для моделей вне списка. 0 — незнакомые модели не оцениваем онлайн.',
    source: 'прайс выкупа владельца',
  },
  {
    key: 'tradein.grade_b_bps',
    label: 'Выкуп · множитель «хорошее»',
    group: 'tradein',
    kind: 'bps',
    fallback: 8_200,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: '8200 = 82% от базы. 0 — состояние не выкупаем онлайн.',
    source: 'коммерческое решение владельца',
  },
  {
    key: 'tradein.grade_c_bps',
    label: 'Выкуп · множитель «удовлетворительное»',
    group: 'tradein',
    kind: 'bps',
    fallback: 6_200,
    min: 0,
    max: 10_000,
    unit: 'bps',
    hint: '6200 = 62% от базы. 0 — состояние не выкупаем онлайн.',
    source: 'коммерческое решение владельца',
  },
  {
    key: 'tradein.round_som',
    label: 'Выкуп · шаг округления',
    group: 'tradein',
    kind: 'int',
    fallback: 500,
    min: 0,
    max: 10_000,
    unit: 'сом',
    hint: 'К ближайшему шагу. 0 — не округлять.',
    source: 'коммерческое решение владельца',
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

/**
 * Разобрать ссылочный параметр.
 *
 * Значение попадает в `src` картинки на публичной витрине, поэтому проверка
 * здесь не косметическая: `javascript:` в этом месте — исполняемый код на
 * странице покупателя, `data:` — способ положить мегабайты в строку настройки,
 * `http://` на https-витрине просто не загрузится и оставит пустое место.
 * Разрешаем только относительный путь загруженного файла и https-адрес.
 */
export function parseSettingText(definition: SettingDefinition, raw: string): string {
  if (!isTextSetting(definition)) {
    throw new ValidationError('invalid_setting_value', `${definition.label}: это числовой параметр`);
  }
  const value = raw.trim();
  if (value === '') return '';
  if (value.length > definition.max) {
    throw new ValidationError(
      'setting_out_of_range',
      `${definition.label}: не длиннее ${definition.max} символов`,
    );
  }
  // Проверка адреса — только для `url`. У `text` содержимое произвольное:
  // это документ, который владелец вставляет целиком, вместе с переносами.
  if (definition.kind === 'url') {
    // `//host/qr.png` и `\\host\qr.png` начинаются со слэша, но относительным
    // путём не являются: браузер уходит по ним на сторонний сервер. Для
    // платёжного QR это подмена реквизитов на карточке товара.
    const protocolRelative = /^[/\\]{2}/.test(value);
    const allowed = !protocolRelative && (value.startsWith('/') || value.startsWith('https://'));
    if (!allowed) {
      throw new ValidationError(
        'invalid_setting_value',
        `${definition.label}: нужен загруженный файл или https-ссылка`,
      );
    }
  }
  return value;
}

/** Parse and range-check a stored or submitted value against its definition. */
export function parseSettingValue(definition: SettingDefinition, raw: string): number {
  if (isTextSetting(definition)) {
    throw new ValidationError('invalid_setting_value', `${definition.label}: это текстовый параметр`);
  }
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
