import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

/**
 * Delivers outbox messages by email via nodemailer SMTP. With no SMTP_HOST set it
 * falls back to jsonTransport in development/tests so mail can be inspected
 * without network access. Production fails closed instead of marking a message
 * delivered without sending it.
 */
@Injectable()
export class EmailNotificationTransport implements NotificationTransport {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly isProduction: boolean;
  private readonly smtpConfigured: boolean;

  constructor(config: ConfigService) {
    this.from =
      config.get<string>('SMTP_FROM') ?? 'AliStore <no-reply@ali.kg>';
    const host = config.get<string>('SMTP_HOST');
    this.isProduction =
      config.get<string>('NODE_ENV')?.trim().toLowerCase() === 'production';
    this.smtpConfigured = Boolean(host?.trim());
    this.transporter = host
      ? createTransport({
          host,
          port: Number(config.get<string>('SMTP_PORT') ?? 587),
          secure: config.get<string>('SMTP_SECURE') === 'true',
          // A stalled SMTP socket must reach the outbox retry path instead of
          // occupying a worker indefinitely.
          connectionTimeout: 3_000,
          greetingTimeout: 3_000,
          socketTimeout: 3_000,
          auth: config.get<string>('SMTP_USER')
            ? {
                user: config.get<string>('SMTP_USER') as string,
                pass: config.get<string>('SMTP_PASS') ?? '',
              }
            : undefined,
        })
      : createTransport({ jsonTransport: true });
  }

  /** Build the mail options (pure — testable without SMTP). */
  buildMail(message: DeliverableMessage): {
    from: string;
    to: string;
    subject: string;
    text: string;
  } {
    return {
      from: this.from,
      to: message.recipient,
      subject: `AliStore — ${message.template}`,
      text: `Событие: ${message.template}\n${JSON.stringify(
        message.payload ?? {},
        null,
        2,
      )}`,
    };
  }

  async deliver(message: DeliverableMessage): Promise<void> {
    if (this.isProduction && !this.smtpConfigured) {
      throw new Error('SMTP_HOST is not configured; production email delivery is disabled');
    }
    await this.transporter.sendMail(this.buildMail(message));
  }
}
