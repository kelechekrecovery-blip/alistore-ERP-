import { ConfigService } from '@nestjs/config';
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
});
