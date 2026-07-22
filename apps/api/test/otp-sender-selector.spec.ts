import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AndroidGatewayOtpSender } from '../src/auth/android-gateway-otp.sender';
import { NoopOtpSender } from '../src/auth/noop-otp.sender';
import { selectOtpSender } from '../src/auth/otp-sender-selector';
import { ProductionOtpSender } from '../src/auth/production-otp.sender';

describe('OTP sender selector', () => {
  const select = (values: Record<string, string> = {}) => selectOtpSender((name) => values[name]);

  it('uses a silent noop sender only outside production', () => {
    expect(select()).toBeInstanceOf(NoopOtpSender);
    expect(select({ SMS_PROVIDER: 'noop' })).toBeInstanceOf(NoopOtpSender);
    expect(() => select({ NODE_ENV: 'production' })).toThrow('SMS_PROVIDER is required');
  });

  it('fails closed for unknown or incomplete production SMS configuration', () => {
    expect(() => select({ SMS_PROVIDER: 'unknown' })).toThrow('Unsupported SMS_PROVIDER');
    expect(() => select({ SMS_PROVIDER: 'production', SMS_API_KEY: 'secret' }))
      .toThrow('Incomplete production SMS configuration');
  });

  it('selects the fail-visible production sender only for a complete env set', () => {
    expect(select({
      SMS_PROVIDER: 'production',
      SMS_API_URL: 'https://sms.example.test',
      SMS_API_KEY: 'secret',
      SMS_SENDER_ID: 'AliStore',
    })).toBeInstanceOf(ProductionOtpSender);
  });

  /**
   * Мост через телефон с обычной SIM. Отдельное имя режима, а не `production`,
   * выбрано намеренно: это не сертифицированный A2P-канал, и preflight с
   * external-readiness обязаны отличать одно от другого.
   */
  const gatewayEnv = {
    SMS_PROVIDER: 'android_gateway',
    SMS_GATEWAY_URL: 'https://api.sms-gate.app/3rdparty/v1',
    SMS_GATEWAY_USERNAME: 'device-user',
    SMS_GATEWAY_PASSWORD: 'device-pass',
    SMS_GATEWAY_ENCRYPTION_PASSPHRASE: 'passphrase',
  };

  it('selects the Android gateway bridge for a complete env set', () => {
    expect(select(gatewayEnv)).toBeInstanceOf(AndroidGatewayOtpSender);
  });

  it('fails closed when the Android gateway env is incomplete', () => {
    // Парольная фраза сюда не входит: у неё отдельное сообщение, потому что её
    // отсутствие — не неполная настройка, а выключенное шифрование (тест ниже).
    const connection = ['SMS_GATEWAY_URL', 'SMS_GATEWAY_USERNAME', 'SMS_GATEWAY_PASSWORD'];
    for (const omitted of connection) {
      const partial = { ...gatewayEnv, [omitted]: '' };
      expect(() => select(partial)).toThrow('Incomplete Android SMS gateway configuration');
    }
  });

  /**
   * Парольная фраза — не «ещё одна переменная»: без неё код входа ушёл бы в
   * публичное облако открытым текстом. Проверяем её отдельно, чтобы никто не
   * сделал её необязательной ради удобства запуска.
   */
  it('refuses the gateway without an encryption passphrase', () => {
    expect(() => select({ ...gatewayEnv, SMS_GATEWAY_ENCRYPTION_PASSPHRASE: '' }))
      .toThrow('SMS_GATEWAY_ENCRYPTION_PASSPHRASE');
  });

  /**
   * Логика селектора была покрыта полностью — и всё же прод не поднимался.
   * `render.yaml` задавал `SMS_PROVIDER: silent`, селектор такого значения не
   * знает и бросает, а вызов стоит в `useFactory` провайдера `OTP_SENDER`
   * (`auth.module.ts`), то есть выполняется при инициализации модуля Nest.
   * Контейнер падал до первого запроса, и снаружи это выглядело как 502 от
   * Cloudflare без единой подсказки о причине.
   *
   * Тесты выше проверяют код против выдуманных значений и такого поймать не
   * могут. Этот проверяет код против того, с чем сервис реально поедет.
   */
  it('принимает каждое значение SMS_PROVIDER, объявленное в render.yaml', () => {
    // Разбор текстом, а не через js-yaml: тянуть зависимость (и её типы) ради
    // одного ключа дороже, чем прочитать пару строк блюпринта.
    const blueprint = readFileSync(join(__dirname, '../../../render.yaml'), 'utf8');
    const declared = [...new Set(
      [...blueprint.matchAll(/key:\s*SMS_PROVIDER\s*\n\s*value:\s*(.+)/g)]
        .map((match) => match[1].trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean),
    )];

    expect(declared.length).toBeGreaterThan(0);
    for (const value of declared) {
      expect(() => select({ SMS_PROVIDER: value })).not.toThrow();
    }
  });

  /**
   * И то же самое в тех условиях, в которых сервис реально работает.
   *
   * Первая версия этой проверки не задавала `NODE_ENV`, поэтому «зеленела» на
   * `noop` — и пропустила бы главное: в блюпринте стоит `NODE_ENV=production`
   * (`render.yaml`), а под ним `noop` бросает «SMS_PROVIDER is required in
   * production», `production` — «Incomplete production SMS configuration» (кредов
   * в блюпринте нет). То есть API не мог подняться ни при одном значении, и
   * подмена одного слова на другое ничего бы не исправила.
   *
   * Вход по SMS не нужен, чтобы оформить заказ гостем с оплатой при получении.
   * Поэтому отсутствие SMS-провайдера обязано быть рабочим состоянием, а не
   * причиной падения контейнера.
   */
  it('поднимается в production с тем, что объявлено в render.yaml', () => {
    const blueprint = readFileSync(join(__dirname, '../../../render.yaml'), 'utf8');
    const declared = [...new Set(
      [...blueprint.matchAll(/key:\s*SMS_PROVIDER\s*\n\s*value:\s*(.+)/g)]
        .map((match) => match[1].trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean),
    )];

    for (const value of declared) {
      expect(() => select({ SMS_PROVIDER: value, NODE_ENV: 'production' })).not.toThrow();
    }
  });

  it('без SMS-провайдера отправка кода отклоняется понятной ошибкой, а не падением старта', async () => {
    const sender = select({ SMS_PROVIDER: 'disabled', NODE_ENV: 'production' });
    await expect(sender.send({
      phone: '+996700000000',
      code: '123456',
      purpose: 'login',
      expiresInSeconds: 300,
    })).rejects.toThrow(/не подключ/i);
  });
});
