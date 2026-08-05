import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailOtpSender, SendEmailOtpInput } from './email-otp.sender';

type SmtpSocket = { destroy(): void; socket?: SmtpSocket };
type SmtpConnection = {
  _socket?: SmtpSocket;
  once(event: 'error', listener: (error: Error) => void): void;
  once(event: 'end', listener: () => void): void;
  connect(callback: (error?: Error | null) => void): void;
  login(
    auth: { user: string; pass: string },
    callback: (error?: Error | null) => void,
  ): void;
  send(
    envelope: { from: string; to: string[] },
    message: NodeJS.ReadableStream,
    callback: (error?: Error | null) => void,
  ): void;
  close(): void;
};
type CompiledMail = {
  getEnvelope(): { from: string; to: string[] };
  createReadStream(): NodeJS.ReadableStream;
};

// Nodemailer does not publish TypeScript declarations for these low-level
// modules. They are used deliberately: SMTPTransport.close() cannot reach the
// active per-message socket, while account deletion requires real cancellation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SMTPConnection = require('nodemailer/lib/smtp-connection') as new (
  options: Record<string, unknown>,
) => SmtpConnection;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MailComposer = require('nodemailer/lib/mail-composer') as new (
  mail: Record<string, unknown>,
) => { compile(): CompiledMail };

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
  private readonly from: string;
  private readonly configured: boolean;
  private readonly totalTimeoutMs: number;
  private readonly connectionOptions: Record<string, unknown>;
  private readonly auth?: { user: string; pass: string };

  constructor(config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM') ?? 'AliStore <no-reply@ali.kg>';
    const configuredTimeout = Number(config.get<string>('SMTP_OTP_TOTAL_TIMEOUT_MS') ?? 9_000);
    this.totalTimeoutMs = Number.isFinite(configuredTimeout)
      ? Math.max(10, Math.min(10_000, Math.floor(configuredTimeout)))
      : 9_000;
    const host = config.get<string>('SMTP_HOST');
    this.configured = Boolean(host);
    this.connectionOptions = {
      host: host ?? '',
      port: Number(config.get<string>('SMTP_PORT') ?? 587),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      connectionTimeout: 3_000,
      greetingTimeout: 3_000,
      socketTimeout: 3_000,
    };
    const user = config.get<string>('SMTP_USER');
    this.auth = user ? { user, pass: config.get<string>('SMTP_PASS') ?? '' } : undefined;
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
    this.assertOperational();
    const connection = new SMTPConnection(this.connectionOptions);
    const message = new MailComposer(this.buildMail(input)).compile();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        connection.close();
        if (error) reject(error);
        else resolve();
      };
      const abort = () => {
        // close() uses socket.end() after greeting and can flush an in-flight
        // DATA body. Destroy the owned socket first so no byte can be delivered
        // after the deletion fence is released.
        const socket = connection._socket?.socket ?? connection._socket;
        socket?.destroy();
        finish(new Error('SMTP OTP delivery timed out'));
      };
      const timer = setTimeout(abort, this.totalTimeoutMs);
      const dispatch = () => {
        if (settled) return;
        connection.send(message.getEnvelope(), message.createReadStream(), finish);
      };

      connection.once('error', (error) => finish(error));
      connection.once('end', () => {
        finish(new Error('SMTP connection closed unexpectedly'));
      });
      connection.connect((connectError) => {
        if (settled) return;
        if (connectError) return finish(connectError);
        if (!this.auth) return dispatch();
        connection.login(this.auth, (loginError) => {
          if (loginError) return finish(loginError);
          dispatch();
        });
      });
    });
  }
}
