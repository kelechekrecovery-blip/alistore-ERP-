import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

/**
 * End-to-end шифрование полей для SMS Gateway for Android.
 *
 * Зачем оно обязательно, а не опционально: публичное облако `sms-gate.app`
 * официально годится «only for non-sensitive data», а мы отправляем через него
 * одноразовый код входа — то есть учётные данные. Зашифрованное поле облако
 * передаёт как есть, расшифровка происходит на телефоне, и relay кода не видит.
 *
 * Схема сверена по официальному Python-клиенту `android-sms-gateway/client-py`
 * (`encryption.py`), а не по документации: документация задаёт формат строки, но
 * умалчивает раскладку IV. Существенная и неочевидная деталь — **соль
 * одновременно служит вектором инициализации CBC**:
 *
 *     cipher = AES.new(key, AES.MODE_CBC, iv=saltBytes)
 *
 * Поэтому отдельного IV в payload нет, и добавлять его нельзя: устройство
 * возьмёт IV из соли и получит мусор.
 */

/** Длина соли из client-py; она же длина блока AES, потому что служит IV. */
const SALT_BYTES = 16;
/** dkLen из client-py: AES-256 требует 32-байтового ключа. */
const KEY_BYTES = 32;
/** Значение по умолчанию из client-py (`75_000`). */
export const DEFAULT_SMS_GATEWAY_ITERATIONS = 75_000;

export interface EncryptGatewayFieldOptions {
  iterations?: number;
  /** Только для тестов: в проде соль обязана быть случайной. */
  salt?: Buffer;
}

/**
 * Зашифровать одно поле (текст сообщения или номер получателя).
 *
 * Возвращает строку вида
 * `$aes-256-cbc/pbkdf2-sha1$i=<iterations>$<base64 соль>$<base64 шифротекст>`.
 */
export function encryptGatewayField(
  cleartext: string,
  passphrase: string,
  options: EncryptGatewayFieldOptions = {},
): string {
  // Пустая фраза дала бы предсказуемый ключ и тихо превратила шифрование в
  // видимость защиты — при том что `isEncrypted: true` мы всё равно отправим.
  if (!passphrase) {
    throw new Error('SMS gateway encryption passphrase is required');
  }
  const iterations = options.iterations ?? DEFAULT_SMS_GATEWAY_ITERATIONS;
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const key = pbkdf2Sync(passphrase, salt, iterations, KEY_BYTES, 'sha1');
  // IV — та же соль (см. комментарий к модулю).
  const cipher = createCipheriv('aes-256-cbc', key, salt);
  // Node дополняет по PKCS#7 сам — это то же, что `pad(..., AES.block_size)`.
  const payload = Buffer.concat([cipher.update(cleartext, 'utf8'), cipher.final()]);
  return [
    '',
    'aes-256-cbc/pbkdf2-sha1',
    `i=${iterations}`,
    salt.toString('base64'),
    payload.toString('base64'),
  ].join('$');
}
