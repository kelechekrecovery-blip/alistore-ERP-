import { ConfigService } from '@nestjs/config';
import { type AddressInfo, createServer } from 'node:net';
import { SmtpEmailOtpSender } from '../src/auth/smtp-email-otp.sender';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (name: string) => values[name],
  } as unknown as ConfigService;
}

describe('SmtpEmailOtpSender', () => {
  it('fails closed when no SMTP host can deliver the verification code', () => {
    const sender = new SmtpEmailOtpSender(config({}));

    expect(() => sender.assertOperational()).toThrow('SMTP_HOST is not configured');
  });

  it('builds a short-lived account verification email from the configured sender', () => {
    const sender = new SmtpEmailOtpSender(
      config({
        SMTP_HOST: 'smtp.provider.test',
        SMTP_FROM: 'AliStore <no-reply@ali.kg>',
      }),
    );

    expect(() => sender.assertOperational()).not.toThrow();
    expect(
      sender.buildMail({
        email: 'buyer@example.com',
        code: '123456',
        purpose: 'email_attach',
        expiresInSeconds: 300,
      }),
    ).toEqual({
      from: 'AliStore <no-reply@ali.kg>',
      to: 'buyer@example.com',
      subject: 'AliStore — подтверждение адреса',
      text: expect.stringContaining('123456'),
    });
  });

  it('uses a distinct subject for login codes', () => {
    const sender = new SmtpEmailOtpSender(config({ SMTP_HOST: 'smtp.provider.test' }));

    expect(
      sender.buildMail({
        email: 'buyer@example.com',
        code: '654321',
        purpose: 'login',
        expiresInSeconds: 300,
      }).subject,
    ).toBe('AliStore — код для входа');
  });

  it('closes a stalled SMTP transport at the configured total deadline', async () => {
    let markSocketClosed!: () => void;
    const socketClosed = new Promise<void>((resolve) => { markSocketClosed = resolve; });
    const server = createServer((socket) => {
      // Deliberately never send the SMTP greeting. The production low-level
      // connection must destroy this real TCP socket at its total deadline.
      socket.once('close', () => markSocketClosed());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const sender = new SmtpEmailOtpSender(config({
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String((server.address() as AddressInfo).port),
        SMTP_OTP_TOTAL_TIMEOUT_MS: '50',
      }));

      const delivery = sender.send({
        email: 'buyer@example.test',
        code: '123456',
        purpose: 'email_attach',
        expiresInSeconds: 300,
      });
      await expect(delivery).rejects.toThrow('SMTP OTP delivery timed out');
      await expect(socketClosed).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });

  it('rejects a peer socket failure instead of emitting an unhandled error', async () => {
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const sender = new SmtpEmailOtpSender(config({
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String((server.address() as AddressInfo).port),
        SMTP_OTP_TOTAL_TIMEOUT_MS: '1000',
      }));

      await expect(sender.send({
        email: 'buyer@example.test',
        code: '123456',
        purpose: 'email_attach',
        expiresInSeconds: 300,
      })).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });
});
