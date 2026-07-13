import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  FcmMessage,
  FcmPushTransport,
  FcmSender,
} from '../src/outbox/transports/fcm-push.transport';

describe('FcmPushTransport', () => {
  const token = 'android-device-token_1234567890:APA91b-alistore';
  const originalFetch = global.fetch;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.pushToken.deleteMany({ where: { token } });
    await prisma.staffUser.deleteMany({ where: { username: 'fcm-transport-staff' } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    global.fetch = originalFetch;
    await prisma.pushToken.deleteMany({ where: { token } });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends Android staff tokens with a string-only deep-link payload', async () => {
    const staff = await prisma.staffUser.upsert({
      where: { username: 'fcm-transport-staff' },
      update: { active: true },
      create: { username: 'fcm-transport-staff', passwordHash: 'unused', role: 'seller' },
    });
    await prisma.pushToken.create({ data: {
      token, platform: 'android', deviceId: 'install-1', appScope: 'staff', staffId: staff.id,
    } });
    const sender = senderMock({ ok: true, status: 200 });
    const transport = new FcmPushTransport(new ConfigService(), prisma, sender);

    await transport.deliver({
      channel: 'push', recipient: staff.id, template: 'staff_task_created',
      payload: { title: 'Новая задача', body: 'Проверить витрину', taskId: 'task-1', count: 1, ignored: { nested: true }, deepLink: 'alistore-staff://tasks/task-1' },
    });

    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
      token,
      data: expect.objectContaining({ taskId: 'task-1', count: '1', deepLink: 'alistore-staff://tasks/task-1' }),
      android: expect.objectContaining({ priority: 'HIGH' }),
    }));
    const sent = (sender.send as jest.Mock).mock.calls[0][0] as FcmMessage;
    expect(sent.data.ignored).toBeUndefined();
  });

  it('disables permanently invalid registration tokens without retrying', async () => {
    await prisma.pushToken.create({ data: { token, platform: 'android', deviceId: 'install-2' } });
    const sender = senderMock({ ok: false, status: 404, code: 'UNREGISTERED' });
    const transport = new FcmPushTransport(new ConfigService(), prisma, sender);

    await expect(transport.deliver({ channel: 'push', recipient: token, template: 'test', payload: {} }))
      .resolves.toBeUndefined();
    await expect(prisma.pushToken.findUnique({ where: { token } })).resolves.toMatchObject({ enabled: false });
  });

  it('surfaces retryable provider failures to the outbox', async () => {
    const sender = senderMock({ ok: false, status: 503, code: 'UNAVAILABLE' });
    const transport = new FcmPushTransport(new ConfigService(), prisma, sender);

    await expect(transport.deliver({ channel: 'push', recipient: token, template: 'test', payload: {} }))
      .rejects.toThrow('UNAVAILABLE');
  });

  it('exchanges a signed service-account assertion and calls FCM HTTP v1', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = {
      project_id: 'alistore-test',
      client_email: 'push@alistore-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      token_uri: 'https://oauth.test/token',
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(200, { access_token: 'oauth-token', expires_in: 3600 }))
      .mockResolvedValueOnce(response(200, { name: 'projects/alistore-test/messages/1' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const config = { get: (key: string) => key === 'FCM_SERVICE_ACCOUNT_JSON' ? JSON.stringify(account) : undefined } as ConfigService;
    const transport = new FcmPushTransport(config, prisma);

    await transport.deliver({
      channel: 'push', recipient: token, template: 'staff_task_created',
      payload: { title: 'Новая задача', body: 'Проверить витрину', deepLink: 'alistore-staff://tasks/task-1' },
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth.test/token');
    const grant = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(grant.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(grant.get('assertion')?.split('.')).toHaveLength(3);
    expect(fetchMock.mock.calls[1][0]).toBe('https://fcm.googleapis.com/v1/projects/alistore-test/messages:send');
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer oauth-token');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      message: {
        token,
        data: { deepLink: 'alistore-staff://tasks/task-1', template: 'staff_task_created' },
        android: { priority: 'HIGH', notification: { channel_id: 'operations' } },
      },
    });
  });
});

function senderMock(result: { ok: boolean; status: number; code?: string }): FcmSender {
  return { send: jest.fn().mockResolvedValue(result) };
}

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
