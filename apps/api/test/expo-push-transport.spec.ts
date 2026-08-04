import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { ExpoPushTransport } from '../src/outbox/transports/expo-push.transport';

describe('ExpoPushTransport', () => {
  const originalFetch = global.fetch;
  let prisma: PrismaService;
  let transport: ExpoPushTransport;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.pushToken.deleteMany();
    await prisma.customer.deleteMany({
      where: { phone: { startsWith: '+996761' } },
    });
    transport = new ExpoPushTransport(
      config({
        EXPO_PUSH_API_URL: 'https://expo.test/--/api/v2/push/send',
        EXPO_PUBLIC_EAS_PROJECT_ID: 'project-1',
        EXPO_PUSH_ACCESS_TOKEN: 'push-secret',
      }),
      prisma,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a customer push message to enabled Expo tokens', async () => {
    const customer = await prisma.customer.create({
      data: { phone: '+996761000001', name: 'Push Recipient' },
    });
    await prisma.pushToken.createMany({
      data: [
        {
          token: 'ExponentPushToken[tokenA]',
          platform: 'ios',
          deviceId: 'ios-1',
          appScope: 'customer',
          customerId: customer.id,
        },
        {
          token: 'ExponentPushToken[tokenB]',
          platform: 'android',
          deviceId: 'android-1',
          appScope: 'customer',
          customerId: customer.id,
        },
      ],
    });
    const fetchMock = jest.fn().mockResolvedValue(okResponse({
      data: [
        { status: 'ok', id: 'ticket-a' },
        { status: 'ok', id: 'ticket-b' },
      ],
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await transport.deliver({
      channel: 'push',
      recipient: customer.id,
      template: 'order_paid',
      payload: { orderId: 'o1', message: 'Заказ оплачен' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://expo.test/--/api/v2/push/send');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer push-secret');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      to: 'ExponentPushToken[tokenA]',
      title: 'AliStore',
      body: 'Заказ оплачен',
      channelId: 'orders',
      data: { template: 'order_paid', orderId: 'o1', recipient: customer.id },
    });
  });

  it('disables a token when Expo reports DeviceNotRegistered', async () => {
    const customer = await prisma.customer.create({
      data: { phone: '+996761000002', name: 'Unregistered Device' },
    });
    await prisma.pushToken.create({
      data: {
        token: 'ExponentPushToken[deadDevice]',
        platform: 'ios',
        deviceId: 'ios-dead',
        appScope: 'customer',
        customerId: customer.id,
      },
    });
    global.fetch = jest.fn().mockResolvedValue(okResponse({
      data: [
        {
          status: 'error',
          message: 'Device is not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      ],
    })) as unknown as typeof fetch;

    await expect(
      transport.deliver({
        channel: 'push',
        recipient: customer.id,
        template: 'campaign_offer',
        payload: { message: 'Скидка' },
      }),
    ).resolves.toBeUndefined();

    await expect(
      prisma.pushToken.findUnique({ where: { token: 'ExponentPushToken[deadDevice]' } }),
    ).resolves.toMatchObject({ enabled: false });
  });

  it('throws HTTP failures so the outbox relay retries', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ errors: [{ code: 'TOO_MANY_REQUESTS' }] }),
    }) as unknown as typeof fetch;

    await expect(
      transport.deliver({
        channel: 'push',
        recipient: 'ExponentPushToken[directToken]',
        template: 'campaign_offer',
        payload: { message: 'Retry me' },
      }),
    ).rejects.toThrow(/Expo push send failed: 429/);
  });

  it('fails visibly when a bound recipient has no active device tokens', async () => {
    await expect(
      transport.deliver({
        channel: 'push',
        recipient: 'missing-recipient',
        template: 'task_assigned',
        payload: { message: 'Нужен retry' },
      }),
    ).rejects.toThrow(/push_recipient_unavailable/);
  });
});

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}
