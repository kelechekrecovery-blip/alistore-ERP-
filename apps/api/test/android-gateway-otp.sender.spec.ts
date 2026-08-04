import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { AndroidGatewayOtpSender } from '../src/auth/android-gateway-otp.sender';

/** Расшифровать так, как это делает телефон: ключ из соли, IV — та же соль. */
function decryptField(value: string, passphrase: string): string {
  const chunks = value.split('$');
  const iterations = Number(chunks[2].slice(2));
  const salt = Buffer.from(chunks[3], 'base64');
  const key = pbkdf2Sync(passphrase, salt, iterations, 32, 'sha1');
  const decipher = createDecipheriv('aes-256-cbc', key, salt);
  return Buffer.concat([
    decipher.update(Buffer.from(chunks[4], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

describe('Android gateway OTP sender', () => {
  const PASSPHRASE = 'gateway-passphrase';
  const CODE = '482913';
  const PHONE = '+996700123456';

  const options = {
    url: 'https://api.sms-gate.app/3rdparty/v1',
    username: 'device-user',
    password: 'device-pass',
    passphrase: PASSPHRASE,
  };

  const input = { phone: PHONE, code: CODE, purpose: 'login' as const, expiresInSeconds: 300 };

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202, text: async () => '{}' });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('шлёт сообщение на облачный эндпоинт с Basic Auth устройства', async () => {
    await new AndroidGatewayOtpSender(options).send(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sms-gate.app/3rdparty/v1/messages');
    expect(init.method).toBe('POST');
    const expected = Buffer.from('device-user:device-pass').toString('base64');
    expect(init.headers.Authorization).toBe(`Basic ${expected}`);
  });

  /**
   * Главная проверка среза. Публичное облако официально годится «only for
   * non-sensitive data», а мы шлём через него код входа: в теле запроса не
   * должно быть ни кода, ни номера открытым текстом.
   */
  it('не отправляет ни код, ни номер открытым текстом', async () => {
    await new AndroidGatewayOtpSender(options).send(input);

    const rawBody: string = fetchMock.mock.calls[0][1].body;
    expect(rawBody).not.toContain(CODE);
    expect(rawBody).not.toContain(PHONE);

    const body = JSON.parse(rawBody);
    expect(body.isEncrypted).toBe(true);
    // Каждый номер шифруется отдельным значением — так делает клиент-эталон.
    expect(decryptField(body.phoneNumbers[0], PASSPHRASE)).toBe(PHONE);
    expect(decryptField(body.textMessage.text, PASSPHRASE)).toContain(CODE);
  });

  it('живёт не дольше самого кода: ttl равен сроку жизни challenge', async () => {
    await new AndroidGatewayOtpSender(options).send(input);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ttl).toBe(300);
  });

  it('отказ шлюза — явная ошибка, а не молчание', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' });
    await expect(new AndroidGatewayOtpSender(options).send(input))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('сетевой сбой тоже поднимается наверх — challenge удалит вызывающий', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(new AndroidGatewayOtpSender(options).send(input))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  /**
   * Код — учётные данные: он не имеет права попасть ни в текст ошибки, ни в
   * логи. Ответ шлюза цитируем осторожно по той же причине.
   */
  it('не раскрывает код в тексте ошибки', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => `echo ${CODE}` });
    const error = await new AndroidGatewayOtpSender(options).send(input).catch((cause) => cause);
    expect(JSON.stringify(error.getResponse?.() ?? error.message)).not.toContain(CODE);
  });

  it('не повторяет отправку: у кода короткий срок, ретрай прислал бы второе SMS', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await new AndroidGatewayOtpSender(options).send(input).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
