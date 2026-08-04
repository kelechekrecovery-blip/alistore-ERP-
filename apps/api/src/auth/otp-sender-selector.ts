import { AndroidGatewayOtpSender } from './android-gateway-otp.sender';
import { DisabledOtpSender } from './disabled-otp.sender';
import { NoopOtpSender } from './noop-otp.sender';
import { OtpSender } from './otp-sender';
import { ProductionOtpSender } from './production-otp.sender';

export type OtpEnvReader = (name: string) => string | undefined;

export function selectOtpSender(env: OtpEnvReader): OtpSender {
  const mode = env('SMS_PROVIDER')?.trim().toLowerCase();
  // Явный отказ от SMS-входа. Магазин продаёт гостям с оплатой при получении и
  // без личного кабинета, поэтому отсутствие провайдера — конфигурация, а не
  // авария: недоступен ровно вход, а не весь сервис.
  if (mode === 'disabled') return new DisabledOtpSender();
  if (!mode || mode === 'noop') {
    // Строгость сохранена намеренно: `noop` молча «отправляет» код, покупатель
    // ждёт SMS, которой не будет. В production выбор обязан быть явным — либо
    // рабочий провайдер, либо `disabled`. Забыть переменную нельзя.
    if (env('NODE_ENV') === 'production') {
      throw new Error('SMS_PROVIDER is required in production (use "disabled" to run without SMS login)');
    }
    return new NoopOtpSender();
  }
  // Мост через Android-телефон с обычной SIM. Отдельный режим, а не вариант
  // `production`: договора с оператором нет, отправитель — номер вместо бренда,
  // и выдавать это за сертифицированный канал нельзя.
  if (mode === 'android_gateway') {
    const passphrase = value(env, 'SMS_GATEWAY_ENCRYPTION_PASSPHRASE');
    // Отдельной проверкой и раньше остальных: без неё код входа ушёл бы в
    // публичное облако открытым текстом, а оно официально годится только для
    // нечувствительных данных. Пустая фраза — не «неполная конфигурация», а
    // отключённая защита, поэтому и сообщение отдельное.
    if (!passphrase) {
      throw new Error(
        'SMS_GATEWAY_ENCRYPTION_PASSPHRASE is required: OTP must not reach the public relay in cleartext',
      );
    }
    const gateway = {
      url: value(env, 'SMS_GATEWAY_URL'),
      username: value(env, 'SMS_GATEWAY_USERNAME'),
      password: value(env, 'SMS_GATEWAY_PASSWORD'),
    };
    const absent = Object.entries(gateway).filter(([, item]) => !item).map(([name]) => name);
    if (absent.length) {
      throw new Error(`Incomplete Android SMS gateway configuration: ${absent.join(', ')}`);
    }
    return new AndroidGatewayOtpSender({ ...gateway, passphrase });
  }
  if (mode !== 'production') {
    throw new Error(`Unsupported SMS_PROVIDER: ${mode}`);
  }
  const options = {
    apiUrl: value(env, 'SMS_API_URL'),
    apiKey: value(env, 'SMS_API_KEY'),
    senderId: value(env, 'SMS_SENDER_ID'),
  };
  const missing = Object.entries(options).filter(([, item]) => !item).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Incomplete production SMS configuration: ${missing.join(', ')}`);
  }
  return new ProductionOtpSender(options);
}

function value(env: OtpEnvReader, name: string): string {
  return env(name)?.trim() ?? '';
}
