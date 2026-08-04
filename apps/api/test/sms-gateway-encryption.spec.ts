import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import {
  DEFAULT_SMS_GATEWAY_ITERATIONS,
  encryptGatewayField,
} from '../src/auth/sms-gateway-encryption';

/**
 * Схема сверена по официальному Python-клиенту
 * `android-sms-gateway/client-py` (`encryption.py`), потому что документация
 * описывает формат строки, но НЕ описывает раскладку IV — а угадывать в
 * криптографии нельзя. Существенное там одно и неочевидное: шестнадцать байт
 * соли используются одновременно как соль PBKDF2 и как IV режима CBC.
 */
describe('SMS gateway field encryption', () => {
  const PASSPHRASE = 'test-passphrase';

  it('строит значение в формате, который понимает устройство', () => {
    const value = encryptGatewayField('123456', PASSPHRASE);
    // $aes-256-cbc/pbkdf2-sha1$i=<iterations>$<base64 salt>$<base64 data>
    expect(value).toMatch(
      /^\$aes-256-cbc\/pbkdf2-sha1\$i=\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/,
    );
    const [, algorithm, params] = value.split('$');
    expect(algorithm).toBe('aes-256-cbc/pbkdf2-sha1');
    expect(params).toBe(`i=${DEFAULT_SMS_GATEWAY_ITERATIONS}`);
  });

  it('расшифровывается тем же алгоритмом, что и на устройстве', () => {
    const cleartext = 'Код 123456';
    const value = encryptGatewayField(cleartext, PASSPHRASE);
    const chunks = value.split('$');
    const iterations = Number(chunks[2].slice(2));
    const salt = Buffer.from(chunks[3], 'base64');
    const payload = Buffer.from(chunks[4], 'base64');

    // Ровно то, что делает устройство: ключ из соли, IV — та же соль.
    const key = pbkdf2Sync(PASSPHRASE, salt, iterations, 32, 'sha1');
    const decipher = createDecipheriv('aes-256-cbc', key, salt);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');

    expect(decrypted).toBe(cleartext);
  });

  it('соль ровно 16 байт и служит IV — иначе устройство не расшифрует', () => {
    const salt = Buffer.from(encryptGatewayField('x', PASSPHRASE).split('$')[3], 'base64');
    expect(salt).toHaveLength(16);
  });

  it('каждый вызов берёт новую соль, поэтому один и тот же код шифруется по-разному', () => {
    const first = encryptGatewayField('123456', PASSPHRASE);
    const second = encryptGatewayField('123456', PASSPHRASE);
    expect(first).not.toBe(second);
  });

  it('не шифрует на пустой парольной фразе — это молчаливая потеря защиты', () => {
    expect(() => encryptGatewayField('123456', '')).toThrow(/passphrase/i);
  });
});
