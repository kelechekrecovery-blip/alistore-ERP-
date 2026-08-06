export type AuthMethodsEnvReader = (name: string) => string | undefined;

export interface AuthMethodState {
  /** Способом можно войти прямо сейчас. */
  enabled: boolean;
  /** Способом может завести аккаунт человек, которого ещё нет в базе. */
  registers: boolean;
}

export interface AppleMethodState extends AuthMethodState {
  /**
   * Идентификатор для браузерного SDK. Отдаётся отдельно от `enabled`, потому
   * что бэкенд умеет проверять токен от нескольких аудиторий (bundle id
   * приложения и Services ID сайта), а инициализировать веб-SDK можно ровно
   * одним — и подстановка bundle id даёт отказ Apple уже после клика.
   */
  clientId: string | null;
  /** Exact URI used both by Apple JS authorization and the server code exchange. */
  redirectUri: string | null;
}

export interface GoogleMethodState extends AuthMethodState {
  /** Public OAuth web client id consumed by Google Identity Services. */
  clientId: string | null;
}

export interface TelegramMethodState extends AuthMethodState {
  /**
   * Имя бота для атрибута `data-telegram-login` в Login Widget. Нужно только
   * обычному браузеру: вход из Mini App подписывается самим Telegram и имени не
   * требует. Публичный хендл, не секрет — токен наружу не выходит никогда.
   */
  botUsername: string | null;
}

export interface AuthMethodsView {
  phone: AuthMethodState;
  email: AuthMethodState;
  telegram: TelegramMethodState;
  apple: AppleMethodState;
  google: GoogleMethodState;
  recovery: { enabled: boolean };
  anyLoginAvailable: boolean;
  registrationAvailable: boolean;
}

/**
 * Единственный источник правды о том, какие входы живы.
 *
 * Раньше витрина решала это сама — по `NEXT_PUBLIC_*`, вшитым в бандл Next на
 * этапе сборки. Владелец задавал ключ в дашборде Render, а кнопка не появлялась,
 * потому что образ собран раньше; и наоборот — форма телефона рисовалась поверх
 * выключенного SMS-канала и молча не работала. Здесь решение принимает тот же
 * процесс, который потом будет обслуживать запрос, поэтому ответ не может
 * разойтись с поведением сервисов.
 *
 * Правила ниже — зеркало реальных гардов: `otp-sender-selector.ts` (выбор
 * отправителя), `auth.service.ts` (флаги email и recovery, обязательность
 * SMS-challenge при социальной привязке). Меняя гард, меняй и это.
 */
export function describeAuthMethods(env: AuthMethodsEnvReader): AuthMethodsView {
  const production = env('NODE_ENV') === 'production';
  const phoneEnabled = resolvePhoneChannel(env, production);
  const socialFirstSignupEnabled = env('AUTH_SOCIAL_FIRST_SIGNUP_ENABLED')?.trim() === 'true';

  // Phone OTP always creates a fully phone-verified Customer. Apple and Google
  // may also create a phone-less Customer, but only behind the explicit
  // social-first rollout flag below.
  const phone: AuthMethodState = { enabled: phoneEnabled, registers: phoneEnabled };

  const emailFlagAllows = !production || env('AUTH_EMAIL_LOGIN_ENABLED')?.trim() === 'true';
  const emailTransportAllows = !production || Boolean(env('SMTP_HOST')?.trim());
  const email: AuthMethodState = {
    enabled: emailFlagAllows && emailTransportAllows,
    // `verifyEmailOtp` намеренно не создаёт аккаунт: адрес без телефона не
    // может стать покупателем, потому что доставка и оплата при получении
    // требуют номер. Обещать почтой регистрацию нельзя ни при какой настройке.
    registers: false,
  };

  // Telegram enrollment still requires a working phone channel. Apple/Google
  // can bypass that enrollment only when social-first rollout is explicit;
  // otherwise they remain login-only for known identities.
  const telegramEnabled = Boolean(env('TELEGRAM_BOT_TOKEN')?.trim());
  const telegram: TelegramMethodState = {
    enabled: telegramEnabled,
    registers: telegramEnabled && phoneEnabled,
    // Имя без токена бесполезно: подпись проверять нечем, виджет привёл бы к
    // отказу после клика.
    botUsername: telegramEnabled ? env('TELEGRAM_BOT_USERNAME')?.trim() || null : null,
  };

  const appleTokenAudiences = appleAudiences(env);
  const appleEnabled = appleTokenAudiences.length > 0;
  const configuredAppleWebClientId = appleWebClientId(env);
  const configuredAppleRedirectUri = env('APPLE_REDIRECT_URI')?.trim() || null;
  const exposedAppleWebClientId = configuredAppleWebClientId
    && appleTokenAudiences.includes(configuredAppleWebClientId)
    ? configuredAppleWebClientId
    : null;
  const apple: AppleMethodState = {
    enabled: appleEnabled,
    registers: appleEnabled && (phoneEnabled || socialFirstSignupEnabled),
    // Не показываем браузерную кнопку, если API не принимает выпущенный для
    // неё audience. Иначе Apple успешно вернёт токен, а наш API отвергнет его.
    clientId: exposedAppleWebClientId,
    // A code can only be exchanged with the same redirect URI used for
    // authorization. Never derive it from the current browser host: ali.kg and
    // www.ali.kg are both served in production but Apple registration is exact.
    redirectUri: exposedAppleWebClientId ? configuredAppleRedirectUri : null,
  };

  const googleTokenAudiences = googleAudiences(env);
  const googleEnabled = googleTokenAudiences.length > 0;
  const configuredGoogleWebClientId = env('GOOGLE_WEB_CLIENT_ID')?.trim() || null;
  const google: GoogleMethodState = {
    enabled: googleEnabled,
    registers: googleEnabled && (phoneEnabled || socialFirstSignupEnabled),
    // Не показываем кнопку, если выпущенный для неё token API заведомо
    // отклонит по audience. Native client IDs при этом продолжают работать.
    clientId: configuredGoogleWebClientId && googleTokenAudiences.includes(configuredGoogleWebClientId)
      ? configuredGoogleWebClientId
      : null,
  };

  const recoveryConfigured = env('AUTH_RECOVERY_OTP_ENABLED')?.trim();
  const recoveryRolloutAllows = recoveryConfigured === 'true'
    || (!production && recoveryConfigured !== 'false');

  return {
    phone,
    email,
    telegram,
    apple,
    // Восстановление ходит тем же SMS-каналом, что и обычный вход: без него
    // включённый флаг ничего не даёт, и показывать экран было бы обманом.
    recovery: { enabled: recoveryRolloutAllows && phoneEnabled },
    google,
    anyLoginAvailable: phone.enabled || email.enabled || telegram.enabled || apple.enabled || google.enabled,
    registrationAvailable: phone.registers || telegram.registers || apple.registers || google.registers,
  };
}

function googleAudiences(env: AuthMethodsEnvReader): string[] {
  return (env('GOOGLE_CLIENT_ID') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Повторяет `selectOtpSender`, но отвечает на другой вопрос: не «какой класс
 * подставить», а «дойдёт ли код до человека».
 *
 * Разница существенна ровно в одном месте — `production`. Этот режим проходит
 * селектор и рапортует `ready` в production-preflight, однако
 * `ProductionOtpSender` не содержит ни одного сетевого вызова: он пустой слот
 * под будущий договор с оператором и отвечает 503 на каждый запрос кода.
 * Единственный режим, который действительно отправляет SMS, — `android_gateway`.
 */
function resolvePhoneChannel(env: AuthMethodsEnvReader, production: boolean): boolean {
  const mode = env('SMS_PROVIDER')?.trim().toLowerCase();
  if (mode === 'android_gateway') return true;
  if (mode === 'disabled' || mode === 'production') return false;
  // Ни `noop`, ни пустое значение в production недостижимы: селектор роняет
  // контейнер на старте. Значит сюда мы попадаем только вне production, где
  // работает NoopOtpSender и код виден через AUTH_OTP_DEV_ECHO.
  return !production;
}

function appleAudiences(env: AuthMethodsEnvReader): string[] {
  return (env('APPLE_CLIENT_ID') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Только явное значение — никакого вывода из `APPLE_CLIENT_ID`.
 *
 * Раньше единственный элемент списка отдавался вебу как «однозначный». Он не
 * однозначен: рекомендованное в документации одиночное значение —
 * `kg.alistore.client`, то есть **bundle id iOS-приложения**. Браузерный SDK,
 * инициализированный им, получает отказ Apple уже после клика, и человек видит
 * «Не удалось войти через Apple» вместо отсутствующей кнопки. Services ID и
 * bundle id по виду строки неразличимы, поэтому угадывание убрано совсем.
 */
function appleWebClientId(env: AuthMethodsEnvReader): string | null {
  return env('APPLE_WEB_CLIENT_ID')?.trim() || null;
}
