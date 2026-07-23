export const EMAIL_OTP_SENDER = Symbol('EMAIL_OTP_SENDER');

export type EmailOtpPurpose = 'login' | 'email_attach';

export interface SendEmailOtpInput {
  email: string;
  code: string;
  purpose: EmailOtpPurpose;
  expiresInSeconds: number;
}

/**
 * Порт доставки одноразового кода на email. Отдельный от `OtpSender`: тот
 * описывает SMS-каналы (оператор, android-шлюз), у которых свои режимы отказа и
 * своя строка готовности в preflight. Смешивать их в одном интерфейсе значило бы
 * выдавать настроенный SMTP за настроенного SMS-оператора.
 */
export interface EmailOtpSender {
  readonly name: 'noop' | 'smtp';
  /** Бросает, если канал не может доставлять — до того, как код будет создан. */
  assertOperational(): void;
  send(input: SendEmailOtpInput): Promise<void>;
}

/** Ничего не отправляет: dev и тесты, где код возвращается через AUTH_OTP_DEV_ECHO. */
export class NoopEmailOtpSender implements EmailOtpSender {
  readonly name = 'noop' as const;

  assertOperational(): void {
    // Канал намеренно неоперационен, но не блокирует локальную разработку.
  }

  async send(): Promise<void> {
    // no-op
  }
}
