import { ServiceUnavailableException } from '@nestjs/common';
import { OtpSender, SendOtpInput } from './otp-sender';
import { encryptGatewayField } from './sms-gateway-encryption';

export interface AndroidGatewayOtpSenderOptions {
  /** База 3rdparty API, например `https://api.sms-gate.app/3rdparty/v1`. */
  url: string;
  username: string;
  password: string;
  /** Та же парольная фраза, что задана на устройстве в `encryption.passphrase`. */
  passphrase: string;
}

/**
 * Запрос обязан упасть быстро. У кода короткий TTL, а `AuthService.requestOtp`
 * удаляет challenge ровно тогда, когда `send` бросил: зависший на минуту запрос
 * оставил бы покупателя ждать SMS, которая уже не нужна.
 */
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Доставка OTP через Android-телефон с обычной SIM
 * (`capcom6/android-sms-gateway`, режим Cloud).
 *
 * Это **мост, а не боевой канал**: договора с оператором нет, отправитель —
 * номер, а не бренд, и абонентская SIM не является легальным A2P-каналом.
 * Поэтому режим намеренно назван отдельно от `production` — чтобы preflight и
 * external-readiness не выдавали его за сертифицированного провайдера.
 * `ProductionOtpSender` остаётся пустым слотом под настоящий договор.
 */
export class AndroidGatewayOtpSender implements OtpSender {
  readonly name = 'android_gateway' as const;

  constructor(private readonly options: AndroidGatewayOtpSenderOptions) {}

  /** Шлюз настроен — вход доступен. Реальную доступность покажет сама отправка. */
  assertOperational(): void {}

  async send(input: SendOtpInput): Promise<void> {
    const { passphrase } = this.options;
    // Шифруется и текст, и каждый номер — ровно как в клиенте-эталоне. Флаг
    // говорит устройству расшифровать поля перед отправкой в сеть оператора.
    const body = JSON.stringify({
      phoneNumbers: [encryptGatewayField(input.phone, passphrase)],
      textMessage: { text: encryptGatewayField(smsText(input), passphrase) },
      isEncrypted: true,
      ttl: input.expiresInSeconds,
    });

    let response: Response;
    try {
      response = await fetch(`${trimSlash(this.options.url)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(
            `${this.options.username}:${this.options.password}`,
          ).toString('base64')}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Причину наружу не тащим: в ней может оказаться тело запроса.
      this.unavailable('sms_gateway_unreachable', 'Шлюз SMS недоступен. Попробуйте ещё раз.');
    }

    if (!response.ok) {
      // Ответ шлюза не цитируем — он может содержать эхо отправленных полей.
      this.unavailable(
        'sms_gateway_rejected',
        `Шлюз SMS отклонил отправку (HTTP ${response.status}).`,
      );
    }
  }

  private unavailable(code: string, message: string): never {
    throw new ServiceUnavailableException({ code, message });
  }
}

/**
 * Одним сегментом: кириллическая SMS — это 70 символов, а не 160, и второй
 * сегмент стоит вторую отправку с абонентской SIM.
 */
function smsText(input: SendOtpInput): string {
  const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
  return `AliStore: код ${input.code}. Действует ${minutes} мин. Никому его не сообщайте.`;
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
