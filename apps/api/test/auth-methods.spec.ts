import { describeAuthMethods } from '../src/auth/auth-methods';

/**
 * Витрина не имеет права угадывать, какие входы живы: до сих пор она решала это
 * по `NEXT_PUBLIC_*`, вшитым в сборку Next, тогда как настоящий ответ знает
 * только процесс API. Владелец задавал ключ в дашборде Render — кнопка не
 * появлялась, потому что бандл собран месяц назад. Этот модуль — единственный
 * источник правды, и он обязан совпадать с тем, что реально сделают сервисы.
 */
function env(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe('describeAuthMethods: что реально пустит человека внутрь', () => {
  describe('телефон', () => {
    it('мост через Android-телефон — единственный канал, который доставляет SMS', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
      }));
      expect(methods.phone).toEqual({ enabled: true, registers: true });
    });

    it('SMS_PROVIDER=disabled закрывает и вход, и регистрацию', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'disabled',
      }));
      expect(methods.phone).toEqual({ enabled: false, registers: false });
    });

    /**
     * Мина, ради которой этот тест написан. `SMS_PROVIDER=production` проходит
     * селектор и рапортует `ready` в production-preflight, но
     * `ProductionOtpSender` не содержит ни одного сетевого вызова: каждый запрос
     * кода — 503 `production_sms_provider_not_activated`. Показать здесь `true`
     * значило бы нарисовать покупателю форму, которая гарантированно молчит.
     */
    it('SMS_PROVIDER=production — пустой слот под договор, а не рабочий канал', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'production',
        SMS_API_URL: 'https://provider.example',
        SMS_API_KEY: 'k',
        SMS_SENDER_ID: 'AliStore',
      }));
      expect(methods.phone).toEqual({ enabled: false, registers: false });
    });

    it('вне production незаданный провайдер — это NoopOtpSender, вход работает', () => {
      const methods = describeAuthMethods(env({ NODE_ENV: 'development' }));
      expect(methods.phone).toEqual({ enabled: true, registers: true });
    });
  });

  describe('email', () => {
    it('в production нужен и флаг, и SMTP_HOST', () => {
      const base = { NODE_ENV: 'production', SMS_PROVIDER: 'disabled' };
      expect(describeAuthMethods(env({ ...base })).email.enabled).toBe(false);
      expect(describeAuthMethods(env({
        ...base,
        AUTH_EMAIL_LOGIN_ENABLED: 'true',
      })).email.enabled).toBe(false);
      expect(describeAuthMethods(env({
        ...base,
        AUTH_EMAIL_LOGIN_ENABLED: 'true',
        SMTP_HOST: 'smtp.mailgun.org',
      })).email.enabled).toBe(true);
    });

    /**
     * `verifyEmailOtp` намеренно не создаёт аккаунт: адрес без телефона не может
     * стать покупателем, потому что доставка и оплата при получении требуют
     * номер. Значит email — вход для уже существующих, и обещать им регистрацию
     * нельзя ни при какой конфигурации.
     */
    it('никогда не регистрирует — код уходит только на привязанный адрес', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        AUTH_EMAIL_LOGIN_ENABLED: 'true',
        SMTP_HOST: 'smtp.mailgun.org',
        SMS_PROVIDER: 'android_gateway',
      }));
      expect(methods.email).toEqual({ enabled: true, registers: false });
    });
  });

  describe('социальные входы', () => {
    it('Google требует серверную аудиторию и явный web client id', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com,ios.apps.googleusercontent.com',
        GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com',
      }));
      expect(methods.google).toEqual({
        enabled: true,
        registers: true,
        clientId: 'web.apps.googleusercontent.com',
      });
    });

    it('не выводит Google web client id из серверного списка аудиторий', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'disabled',
        GOOGLE_CLIENT_ID: 'android.apps.googleusercontent.com',
      }));
      expect(methods.google).toEqual({ enabled: true, registers: false, clientId: null });
    });

    it('скрывает Google web client id, который API не принимает как audience', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        GOOGLE_CLIENT_ID: 'ios.apps.googleusercontent.com',
        GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com',
      }));
      expect(methods.google).toEqual({ enabled: true, registers: true, clientId: null });
    });

    /**
     * Login Widget в обычном браузере требует ИМЯ бота в атрибуте
     * `data-telegram-login` — токен для этого не годится и наружу не выйдет
     * никогда. Как и с Apple, ничего не выводим: нет имени — нет виджета, при
     * этом вход из Mini App продолжает работать, ему имя не нужно.
     */
    it('имя бота для виджета отдаётся только явным TELEGRAM_BOT_USERNAME', () => {
      const withoutName = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        TELEGRAM_BOT_TOKEN: '123:login',
      }));
      expect(withoutName.telegram.enabled).toBe(true);
      expect(withoutName.telegram.botUsername).toBeNull();

      const withName = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        TELEGRAM_BOT_TOKEN: '123:login',
        TELEGRAM_BOT_USERNAME: 'AliStoreBot',
      }));
      expect(withName.telegram.botUsername).toBe('AliStoreBot');
    });

    it('без токена имя бота бесполезно и наружу не идёт', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        TELEGRAM_BOT_USERNAME: 'AliStoreBot',
      }));
      expect(methods.telegram.enabled).toBe(false);
      expect(methods.telegram.botUsername).toBeNull();
    });

    it('Telegram живёт от TELEGRAM_BOT_TOKEN, а не от алертного токена', () => {
      const withAlertOnly = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        ALERT_TELEGRAM_BOT_TOKEN: '123:alert',
      }));
      expect(withAlertOnly.telegram.enabled).toBe(false);

      const withLogin = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        TELEGRAM_BOT_TOKEN: '123:login',
      }));
      expect(withLogin.telegram).toEqual({ enabled: true, registers: true, botUsername: null });
    });

    /**
     * Главная несущая правда всей карты входов: привязка соц-аккаунта к новому
     * покупателю завершается через `completeSocialEnrollment`, который ищет
     * потреблённый SMS-challenge. Нет SMS — Apple и Telegram остаются входом
     * исключительно для тех, у кого identity уже лежит в базе.
     */
    it('без SMS соц-входы пускают только уже привязанных — регистрации нет', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'disabled',
        TELEGRAM_BOT_TOKEN: '123:login',
        APPLE_CLIENT_ID: 'kg.alistore.client',
      }));
      expect(methods.telegram).toEqual({ enabled: true, registers: false, botUsername: null });
      expect(methods.apple.enabled).toBe(true);
      expect(methods.apple.registers).toBe(false);
      expect(methods.registrationAvailable).toBe(false);
    });

    /**
     * Одиночное значение НЕ считается веб-овым по умолчанию. Рекомендованное в
     * документации одиночное значение — `kg.alistore.client`, то есть bundle id
     * приложения: браузерный SDK, инициализированный им, получает отказ Apple
     * уже после клика. Отсутствие кнопки честнее, чем кнопка, ломающаяся
     * в момент нажатия.
     */
    it('не выводит веб-идентификатор из APPLE_CLIENT_ID даже когда он один', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        APPLE_CLIENT_ID: 'kg.alistore.client',
      }));
      // Бэкенд проверит токен нативного приложения — вход как таковой жив.
      expect(methods.apple.enabled).toBe(true);
      // А вебу инициализировать SDK нечем, пока владелец не назвал Services ID.
      expect(methods.apple.clientId).toBeNull();
    });

    it('список client id без явного веб-значения не даёт вебу ничего', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        APPLE_CLIENT_ID: 'kg.alistore.client,kg.alistore.web',
      }));
      expect(methods.apple.enabled).toBe(true);
      expect(methods.apple.clientId).toBeNull();
    });

    it('APPLE_WEB_CLIENT_ID — единственный источник веб-идентификатора', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        APPLE_CLIENT_ID: 'kg.alistore.client,kg.alistore.web',
        APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      }));
      expect(methods.apple.clientId).toBe('kg.alistore.web');
    });

    it('не показывает Apple в вебе, если Services ID не входит в accepted audiences', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        APPLE_CLIENT_ID: 'kg.alistore.client',
        APPLE_WEB_CLIENT_ID: 'kg.alistore.web',
      }));
      expect(methods.apple.enabled).toBe(true);
      expect(methods.apple.clientId).toBeNull();
    });
  });

  describe('восстановление доступа', () => {
    it('повторяет rollout-правило сервиса: в проде — только по явному флагу', () => {
      expect(describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
      })).recovery.enabled).toBe(false);

      expect(describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'android_gateway',
        AUTH_RECOVERY_OTP_ENABLED: 'true',
      })).recovery.enabled).toBe(true);

      expect(describeAuthMethods(env({
        NODE_ENV: 'development',
      })).recovery.enabled).toBe(true);

      expect(describeAuthMethods(env({
        NODE_ENV: 'development',
        AUTH_RECOVERY_OTP_ENABLED: 'false',
      })).recovery.enabled).toBe(false);
    });

    it('без работающего SMS восстановление недостижимо, чем бы ни был флаг', () => {
      const methods = describeAuthMethods(env({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'disabled',
        AUTH_RECOVERY_OTP_ENABLED: 'true',
      }));
      expect(methods.recovery.enabled).toBe(false);
    });
  });

  /**
   * Слепок ровно того, что стоит в боевом блюпринте на момент написания теста:
   * `render.yaml` отдаёт `SMS_PROVIDER=disabled`, `AUTH_EMAIL_LOGIN_ENABLED=false`
   * и не объявляет ни `TELEGRAM_BOT_TOKEN`, ни `APPLE_CLIENT_ID`. Если кто-то
   * починит прод и забудет этот тест — он покраснеет и напомнит обновить карту.
   */
  it('текущий боевой блюпринт не оставляет ни одного входа', () => {
    const methods = describeAuthMethods(env({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'disabled',
      AUTH_EMAIL_LOGIN_ENABLED: 'false',
      AUTH_OTP_DEV_ECHO: 'false',
    }));
    expect(methods.phone.enabled).toBe(false);
    expect(methods.email.enabled).toBe(false);
    expect(methods.telegram.enabled).toBe(false);
    expect(methods.apple.enabled).toBe(false);
    expect(methods.recovery.enabled).toBe(false);
    expect(methods.anyLoginAvailable).toBe(false);
    expect(methods.registrationAvailable).toBe(false);
  });
});
