import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EmailOtpSender, SendEmailOtpInput } from './email-otp.sender';

/**
 * Доставка кода письмом через SMTP.
 *
 * Настройки те же (`SMTP_HOST`/`PORT`/`SECURE`/`USER`/`PASS`/`FROM`), что у
 * outbox-транспорта, но транспорт свой: auth не должен зависеть от модуля
 * рассылок, иначе вход по email начнёт падать вместе с очередью уведомлений.
 * Без `SMTP_HOST` уходим в jsonTransport — письмо собирается, но не уходит.
 */
@Injectable()
export class SmtpEmailOtpSender implements EmailOtpSender {
  readonly name = 'smtp' as const;
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM') ?? 'AliStore <no-reply@ali.kg>';
    const host = config.get<string>('SMTP_HOST');
    this.configured = Boolean(host);
    this.transporter = host
      ? createTransport({
          host,
          port: Number(config.get<string>('SMTP_PORT') ?? 587),
          secure: config.get<string>('SMTP_SECURE') === 'true',
          auth: config.get<string>('SMTP_USER')
            ? {
                user: config.get<string>('SMTP_USER') as string,
                pass: config.get<string>('SMTP_PASS') ?? '',
              }
            : undefined,
        })
      : createTransport({ jsonTransport: true });
  }

  assertOperational(): void {
    if (!this.configured) {
      // Молча «доставленный» в jsonTransport код означал бы, что пользователь
      // ждёт письмо, которого никогда не будет.
      throw new Error('SMTP_HOST is not configured; email OTP cannot be delivered');
    }
  }

  /** Чистая сборка письма — проверяется без SMTP. */
  buildMail(input: SendEmailOtpInput): {
    from: string;
    to: string;
    subject: string;
    text: string;
  } {
    const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
    const subject =
      input.purpose === 'email_attach'
        ? 'AliStore — подтверждение адреса'
        : 'AliStore — код для входа';
    const action =
      input.purpose === 'email_attach'
        ? 'Код для привязки этого адреса к аккаунту AliStore'
        : 'Код для входа в AliStore';
    return {
      from: this.from,
      to: input.email,
      subject,
      text: [
        `${action}: ${input.code}`,
        `Код действует ${minutes} мин.`,
        'Если вы не запрашивали код — просто проигнорируйте это письмо.',
      ].join('\n'),
    };
  }

  async send(input: SendEmailOtpInput): Promise<void> {
    await this.transporter.sendMail(this.buildMail(input));
  }
}
