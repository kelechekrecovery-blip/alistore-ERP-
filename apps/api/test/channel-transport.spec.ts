import { ConfigService } from '@nestjs/config';
import { ChannelNotificationTransport } from '../src/outbox/transports/channel.transport';
import { TelegramBotTransport } from '../src/outbox/transports/telegram-bot.transport';
import { WhatsAppCloudTransport } from '../src/outbox/transports/whatsapp-cloud.transport';

describe('Channel notification transports', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('routes channel messages to Telegram, WhatsApp, and Novu providers', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = new ChannelNotificationTransport(
      config({
        NOVU_API_URL: 'https://novu.test',
        NOVU_API_KEY: 'novu-secret',
        TELEGRAM_API_URL: 'https://telegram.test',
        TELEGRAM_BOT_TOKEN: 'telegram-secret',
        WHATSAPP_API_URL: 'https://graph.test',
        WHATSAPP_API_VERSION: 'v99.0',
        WHATSAPP_ACCESS_TOKEN: 'whatsapp-secret',
        WHATSAPP_PHONE_NUMBER_ID: 'phone-123',
      }),
    );

    await transport.deliver({
      channel: 'telegram',
      recipient: '777001',
      template: 'campaign_offer',
      payload: { message: 'VIP offer' },
    });
    await transport.deliver({
      channel: 'whatsapp',
      recipient: '+996 700 000 001',
      template: 'campaign_offer',
      payload: { message: 'WA offer' },
    });
    await transport.deliver({
      channel: 'sms',
      recipient: '+996700000002',
      template: 'campaign_offer',
      payload: { campaignId: 'c1' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://telegram.test/bottelegram-secret/sendMessage',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      chat_id: '777001',
      text: 'VIP offer',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.test/v99.0/phone-123/messages',
    );
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer whatsapp-secret',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      messaging_product: 'whatsapp',
      to: '996700000001',
      text: { body: 'WA offer' },
    });
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://novu.test/v1/events/trigger',
    );
  });

  it('falls back to log transport when a channel credential is missing', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = new ChannelNotificationTransport(config({}));
    await expect(
      transport.deliver({
        channel: 'whatsapp',
        recipient: '+996700000001',
        template: 'campaign_offer',
        payload: { message: 'No provider yet' },
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws Telegram provider failures so the outbox retries', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: async () => 'rate' }) as unknown as typeof fetch;

    const transport = new TelegramBotTransport(
      config({ TELEGRAM_API_URL: 'https://telegram.test', TELEGRAM_BOT_TOKEN: 't' }),
    );

    await expect(
      transport.deliver({
        channel: 'telegram',
        recipient: '777001',
        template: 'campaign_offer',
        payload: {},
      }),
    ).rejects.toThrow(/Telegram sendMessage failed: 429/);
  });

  it('throws WhatsApp provider failures so the outbox retries', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;

    const transport = new WhatsAppCloudTransport(
      config({
        WHATSAPP_API_URL: 'https://graph.test',
        WHATSAPP_ACCESS_TOKEN: 'w',
        WHATSAPP_PHONE_NUMBER_ID: 'p',
      }),
    );

    await expect(
      transport.deliver({
        channel: 'whatsapp',
        recipient: '+996700000001',
        template: 'campaign_offer',
        payload: {},
      }),
    ).rejects.toThrow(/WhatsApp message failed: 500/);
  });
});

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}
