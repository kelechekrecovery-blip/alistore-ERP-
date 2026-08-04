/**
 * Lightweight i18n dictionaries (ru default, ky). Deliberately a plain in-app
 * dictionary + React context (see ./locale) rather than next-intl: it needs no
 * dependency, no routing/middleware restructure, and is safe to grow section by
 * section on a shared checkout. Russian is the source of truth and the default;
 * a missing key falls back to Russian, then to the key itself.
 *
 * NOTE: the Kyrgyz strings below are a first pass and MUST be reviewed by a native
 * speaker before launch (GAP-I18N-001). RU users see no change — ky is opt-in via
 * the language toggle.
 */
export type Locale = 'ru' | 'ky';

export const LOCALES: readonly Locale[] = ['ru', 'ky'] as const;
export const DEFAULT_LOCALE: Locale = 'ru';

export const LOCALE_LABEL: Record<Locale, string> = { ru: 'RU', ky: 'KY' };

export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'ky';
}

type Dictionary = Record<string, string>;

const ru: Dictionary = {
  'login.title.default': 'Вход в AliStore',
  'login.title.recovery': 'Восстановление доступа',
  'login.subtitle.default': 'Техника с гарантией и trade-in. Войдите по номеру — быстро и безопасно.',
  'login.subtitle.email': 'Войдите по почте — код придёт на адрес, привязанный к аккаунту.',
  'login.subtitle.recovery': 'Введите номер аккаунта — после проверки старые сессии будут отозваны.',
  'login.codeSentTo': 'Код отправлен на {identity}',
  'login.channel.phone': 'Телефон',
  'login.channel.email': 'Почта',
  'login.mode.login': 'Войти',
  'login.mode.recover': 'Восстановить',
  'login.cta.sending': 'Отправляем…',
  'login.cta.email': 'Получить код на почту',
  'login.cta.recovery': 'Получить код восстановления',
  'login.cta.sms': 'Получить код по SMS',
  'login.guest': 'Продолжить как гость →',
  'login.code.placeholder': '6-значный код',
  'login.code.checking': 'Проверяем…',
  'login.code.recover': 'Восстановить доступ',
  'login.code.login': 'Войти',
  'login.code.changeEmail': '← Изменить email',
  'login.code.changePhone': '← Изменить номер',
};

const ky: Dictionary = {
  'login.title.default': 'AliStore-го кирүү',
  'login.title.recovery': 'Кирүүнү калыбына келтирүү',
  'login.subtitle.default': 'Кепилдиги жана trade-in бар техника. Номер менен кириңиз — тез жана коопсуз.',
  'login.subtitle.email': 'Почта менен кириңиз — код аккаунтка байланган дарекке келет.',
  'login.subtitle.recovery': 'Аккаунттун номерин киргизиңиз — текшерүүдөн кийин эски сессиялар жокко чыгарылат.',
  'login.codeSentTo': '{identity} дарегине код жөнөтүлдү',
  'login.channel.phone': 'Телефон',
  'login.channel.email': 'Почта',
  'login.mode.login': 'Кирүү',
  'login.mode.recover': 'Калыбына келтирүү',
  'login.cta.sending': 'Жөнөтүлүүдө…',
  'login.cta.email': 'Почтага код алуу',
  'login.cta.recovery': 'Калыбына келтирүү кодун алуу',
  'login.cta.sms': 'SMS менен код алуу',
  'login.guest': 'Конок катары улантуу →',
  'login.code.placeholder': '6 орундуу код',
  'login.code.checking': 'Текшерилүүдө…',
  'login.code.recover': 'Кирүүнү калыбына келтирүү',
  'login.code.login': 'Кирүү',
  'login.code.changeEmail': '← Email өзгөртүү',
  'login.code.changePhone': '← Номерди өзгөртүү',
};

export const dictionaries: Record<Locale, Dictionary> = { ru, ky };

/** Translate a key for a locale: locale → ru fallback → the key itself. Supports {var} interpolation. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}
