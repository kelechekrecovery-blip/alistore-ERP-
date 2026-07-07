import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { DeliverableMessage, NotificationTransport } from '../outbox.types';

/**
 * Delivers outbox messages by email via nodemailer SMTP. With no SMTP_HOST set it
 * falls back to jsonTransport — builds the message but never sends — a safe
 * default for dev/tests. Set SMTP_HOST/PORT/USER/PASS to actually send.
 */
@Injectable()
export class EmailNotificationTransport implements NotificationTransport {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from =
      config.get<string>('SMTP_FROM') ?? 'AliStore <no-reply@alistore.kg>';
    const host = config.get<string>('SMTP_HOST');
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
    await this.transporter.sendMail(this.buildMail(message));
  }
}
