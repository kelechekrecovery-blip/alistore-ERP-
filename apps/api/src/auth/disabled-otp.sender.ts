import { ServiceUnavailableException } from '@nestjs/common';
import { OtpSender, SendOtpInput } from './otp-sender';

/**
 * SMS-провайдер не подключён — и это рабочее состояние, а не поломка.
 *
 * Отличие от `NoopOtpSender` принципиально: тот молча «отправляет» код и нужен
 * локально и в тестах. Этот честно отказывает — вход по SMS недоступен, пока нет
 * договора с провайдером.
 *
 * Отличие от прежнего поведения ещё важнее. Раньше отсутствие провайдера роняло
 * контейнер Nest при инициализации модуля (`selectOtpSender` вызывается в
 * `useFactory` провайдера `OTP_SENDER`), и снаружи это выглядело как 502 без
 * объяснения. Но вход по SMS не нужен, чтобы оформить заказ гостем с оплатой при
 * получении: магазин обязан работать, а недоступным должен быть ровно личный
 * кабинет — с внятным сообщением вместо падения.
 */
export class DisabledOtpSender implements OtpSender {
  readonly name = 'disabled' as const;

  assertOperational(): void {
    this.unavailable();
  }

  async send(_input: SendOtpInput): Promise<void> {
    this.unavailable();
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'sms_login_unavailable',
      message: 'Вход по SMS не подключён. Заказ можно оформить без входа в аккаунт.',
    });
  }
}
