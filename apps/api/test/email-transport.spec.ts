import { ConfigService } from '@nestjs/config';
import { EmailNotificationTransport } from '../src/outbox/transports/email.transport';

describe('EmailNotificationTransport (nodemailer)', () => {
  // No SMTP_HOST → jsonTransport (builds the message, never sends).
  const config = { get: () => undefined } as unknown as ConfigService;
  const transport = new EmailNotificationTransport(config);

  it('builds a mail with recipient, subject and payload', () => {
    const mail = transport.buildMail({
      channel: 'email',
      recipient: 'buyer@a.kg',
      template: 'order_paid',
      payload: { orderId: 'o1' },
    });
    expect(mail.to).toBe('buyer@a.kg');
    expect(mail.subject).toContain('order_paid');
    expect(mail.text).toContain('o1');
    expect(mail.from.toLowerCase()).toContain('alistore');
  });

  it('dispatches via jsonTransport without a configured SMTP host', async () => {
    await expect(
      transport.deliver({
        channel: 'email',
        recipient: 'buyer@a.kg',
        template: 'order_paid',
        payload: {},
      }),
    ).resolves.toBeUndefined();
  });
});
