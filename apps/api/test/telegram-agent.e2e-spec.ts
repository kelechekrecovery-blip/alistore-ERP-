import { ConfigService } from '@nestjs/config';
import { AuditService } from '../src/audit/audit.service';
import { AuthzService } from '../src/authz/authz.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupportService } from '../src/support/support.service';
import { TelegramAgentRetentionService } from '../src/telegram-agent/telegram-agent-retention.service';
import { TelegramAgentService } from '../src/telegram-agent/telegram-agent.service';
import { OutboxService } from '../src/outbox/outbox.service';

describe('Telegram AI Agent (integration)', () => {
  const webhookSecret = 'webhook_test_secret_32_bytes_long_123';
  const run = `${Date.now()}-${process.pid}`;
  const pointLocation = `TG-${run}`;
  let prisma: PrismaService;
  let authz: AuthzService;
  let support: SupportService;
  let enqueued: jest.Mock<Promise<void>, [unknown]>;
  let enqueueOnTx: jest.Mock<Promise<void>, [unknown, unknown]>;
  let agent: TelegramAgentService;
  let ownerId: string;
  let customerId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    prisma = new PrismaService();
    await prisma.$connect();
    authz = new AuthzService();
    await authz.init();
    support = new SupportService(prisma, new AuditService(prisma));
    enqueued = jest.fn(async (_input: unknown): Promise<void> => undefined);
    enqueueOnTx = jest.fn(async (_tx: unknown, input: unknown): Promise<void> => {
      await enqueued(input);
    });
    const outbox = {
      enqueue: enqueued,
      enqueueOnTx,
    } as unknown as OutboxService;
    agent = new TelegramAgentService(
      prisma,
      new ConfigService({
        TELEGRAM_AGENT_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyzABCDE_12345',
        TELEGRAM_WEBHOOK_SECRET: webhookSecret,
        TELEGRAM_WEBHOOK_URL: 'https://api.example.test/api/telegram-agent/webhook',
        TELEGRAM_MINI_APP_URL: 'https://example.test/tg',
      }),
      outbox,
      new AuditService(prisma),
      authz,
      { dashboard: jest.fn() } as never,
      support,
      {
        verifyStepUp: jest.fn(async () => undefined),
        verifyStepUpOnTx: jest.fn(async () => undefined),
      } as never,
    );

    await prisma.storePoint.create({
      data: {
        code: pointLocation,
        name: 'Telegram Agent Point',
        address: 'Test',
        inventoryLocation: pointLocation,
        hours: '10:00-20:00',
        active: true,
        sortOrder: 999,
        createdBy: 'test',
        idempotencyKey: `telegram-agent-point:${run}`,
      },
    });
    const owner = await prisma.staffUser.create({
      data: {
        username: `tg-owner-${run}`,
        passwordHash: 'not-used',
        role: 'owner',
        point: pointLocation,
      },
    });
    ownerId = owner.id;
    const customer = await prisma.customer.create({
      data: { phone: `+99677${String(Date.now()).slice(-7)}`, name: 'Telegram Customer' },
    });
    customerId = customer.id;
    await prisma.customerIdentity.create({
      data: {
        customerId,
        provider: 'telegram',
        subject: '7001001',
        displayName: 'Telegram Customer',
      },
    });
  });

  afterAll(async () => {
    await prisma.telegramAgentMessage.deleteMany();
    await prisma.telegramAgentPairing.deleteMany();
    await prisma.telegramAgentIdentity.deleteMany();
    await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: [ownerId, customerId] } } });
    await prisma.supportTicket.deleteMany({ where: { customerId } });
    await prisma.customerIdentity.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.staffUser.deleteMany({ where: { id: ownerId } });
    await prisma.storePoint.deleteMany({ where: { inventoryLocation: pointLocation } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    enqueued.mockClear();
    await prisma.telegramAgentMessage.deleteMany();
  });

  it('rejects a webhook without the Bot API secret and stores nothing', async () => {
    await expect(agent.handleWebhook('wrong', update(1, '7001001', '/start')))
      .rejects.toThrow('telegram_webhook_secret_invalid');
    expect(await prisma.telegramAgentMessage.count()).toBe(0);
    expect(enqueued).not.toHaveBeenCalled();
  });

  it('fails closed when an enabled agent has a weak webhook secret', () => {
    const weak = new TelegramAgentService(
      prisma,
      new ConfigService({
        TELEGRAM_AGENT_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyzABCDE_12345',
        TELEGRAM_WEBHOOK_SECRET: 'weak',
        TELEGRAM_WEBHOOK_URL: 'https://api.example.test/api/telegram-agent/webhook',
      }),
      { enqueue: enqueued, enqueueOnTx } as unknown as OutboxService,
      new AuditService(prisma),
      authz,
      { dashboard: jest.fn() } as never,
      support,
      {
        verifyStepUp: jest.fn(async () => undefined),
        verifyStepUpOnTx: jest.fn(async () => undefined),
      } as never,
    );
    expect(() => weak.onModuleInit()).toThrow(/32–256 символов/);
  });

  it('fails closed when the webhook secret contains characters rejected by Telegram', () => {
    const invalid = new TelegramAgentService(
      prisma,
      new ConfigService({
        TELEGRAM_AGENT_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyzABCDE_12345',
        TELEGRAM_WEBHOOK_SECRET: 'invalid+base64/secret=that_is_long_enough',
        TELEGRAM_WEBHOOK_URL: 'https://api.example.test/api/telegram-agent/webhook',
      }),
      { enqueue: enqueued, enqueueOnTx } as unknown as OutboxService,
      new AuditService(prisma),
      authz,
      { dashboard: jest.fn() } as never,
      support,
      {
        verifyStepUp: jest.fn(async () => undefined),
        verifyStepUpOnTx: jest.fn(async () => undefined),
      } as never,
    );
    expect(() => invalid.onModuleInit()).toThrow(/A-Z, a-z, 0-9/);
  });

  it('links owner with a one-time code without sending a password or OTP', async () => {
    const pairing = await agent.createPairing(ownerId, '123456');
    expect(pairing.code).toHaveLength(24);
    await agent.handleWebhook(
      webhookSecret,
      update(2, '9001001', pairing.command),
    );
    const identity = await prisma.telegramAgentIdentity.findUniqueOrThrow({
      where: { telegramUserId: '9001001' },
    });
    expect(identity).toMatchObject({ kind: 'staff', staffId: ownerId, active: true });
    expect(await prisma.telegramAgentPairing.findFirstOrThrow({
      where: { staffId: ownerId },
    })).toMatchObject({ usedAt: expect.any(Date) });
    expect(await prisma.auditEvent.count({
      where: { type: 'telegram_agent.linked', refs: { has: ownerId } },
    })).toBe(1);
    expect(replyText(enqueued.mock.calls[0][0])).not.toMatch(/password|otp|парол/i);
    expect((await prisma.telegramAgentMessage.findUniqueOrThrow({
      where: { externalKey: 'telegram:update:2' },
    })).text).toBe('/link [REDACTED]');
  });

  it('does not process or reply to a duplicate Telegram update', async () => {
    await agent.handleWebhook(webhookSecret, update(3, '9001001', '/help'));
    await agent.handleWebhook(webhookSecret, update(3, '9001001', '/help'));
    expect(await prisma.telegramAgentMessage.count({
      where: { externalKey: 'telegram:update:3' },
    })).toBe(1);
    expect(enqueued).toHaveBeenCalledTimes(1);
  });

  it('revokes every unused pairing code when staff disconnects', async () => {
    const pairing = await agent.createPairing(ownerId, '123456');
    await agent.disconnect(ownerId, '654321');
    expect(await prisma.telegramAgentPairing.count({
      where: { staffId: ownerId, usedAt: null },
    })).toBe(0);
    expect(await prisma.telegramAgentIdentity.findUniqueOrThrow({
      where: { staffId: ownerId },
    })).toMatchObject({ active: false });
    await agent.handleWebhook(webhookSecret, update(5, '9001001', pairing.command));
    expect(await prisma.telegramAgentIdentity.findUniqueOrThrow({
      where: { staffId: ownerId },
    })).toMatchObject({ active: false });
  });

  it('auto-links a Telegram-authenticated customer and creates an idempotent support ticket', async () => {
    await agent.handleWebhook(
      webhookSecret,
      update(4, '7001001', 'Где мой заказ?'),
    );
    expect(await prisma.telegramAgentIdentity.findUnique({
      where: { telegramUserId: '7001001' },
    })).toMatchObject({ kind: 'customer', customerId });
    const tickets = await prisma.supportTicket.findMany({
      where: { customerId, channel: 'telegram' },
    });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].body).toBe('Где мой заказ?');
    expect(replyText(enqueued.mock.calls[0][0])).toContain(tickets[0].id);
  });

  it('retries a failed durable reply without creating a second customer ticket', async () => {
    enqueueOnTx.mockRejectedValueOnce(new Error('outbox unavailable'));
    await expect(agent.handleWebhook(webhookSecret, update(6, '7001001', 'Нужен оператор')))
      .rejects.toThrow('outbox unavailable');
    expect(await prisma.telegramAgentMessage.findUniqueOrThrow({
      where: { externalKey: 'telegram:update:6' },
    })).toMatchObject({ status: 'failed' });

    await agent.handleWebhook(webhookSecret, update(6, '7001001', 'Нужен оператор'));
    expect(await prisma.telegramAgentMessage.findUniqueOrThrow({
      where: { externalKey: 'telegram:update:6' },
    })).toMatchObject({ status: 'answered', attempts: 2 });
    expect(await prisma.supportTicket.count({
      where: { customerId, subject: 'Нужен оператор' },
    })).toBe(1);
  });

  it('redacts credentials before persisting or forwarding a customer request', async () => {
    const fakeToken = '123456:abcdefghijklmnopqrstuvwxyzABCDE_12345';
    await agent.handleWebhook(
      webhookSecret,
      update(7, '7001001', `Случайно отправил ${fakeToken}`),
    );
    const message = await prisma.telegramAgentMessage.findUniqueOrThrow({
      where: { externalKey: 'telegram:update:7' },
    });
    expect(message.text).not.toContain(fakeToken);
    expect(message.text).toContain('[BOT_TOKEN_REDACTED]');
    const ticket = await prisma.supportTicket.findFirstOrThrow({
      where: { customerId, subject: { contains: 'BOT_TOKEN_REDACTED' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(ticket.body).not.toContain(fakeToken);
  });

  it('purges expired message traces independently of inbound webhook traffic', async () => {
    const expired = await prisma.telegramAgentMessage.create({
      data: {
        externalKey: 'telegram:expired:retention-test',
        telegramUserId: 'retention-test',
        chatId: 'retention-test',
        direction: 'inbound',
        text: 'expired PII',
        status: 'answered',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const retention = new TelegramAgentRetentionService(prisma);
    const result = await retention.purgeExpired();
    expect(result.purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.telegramAgentMessage.findUnique({ where: { id: expired.id } })).toBeNull();
  });

  it('redacts expired Telegram outbox payloads and recipients in bounded retention runs', async () => {
    const oldOutbox = await prisma.outboxMessage.create({
      data: {
        id: 'telegram:expired:outbox-retention-test',
        channel: 'telegram',
        recipient: 'old-chat-id',
        template: 'telegram_agent_reply',
        payload: { message: 'old customer PII' },
        status: 'sent',
        sentAt: new Date(Date.now() - 31 * 24 * 60 * 60_000),
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60_000),
      },
    });
    const retention = new TelegramAgentRetentionService(prisma);
    const result = await retention.purgeExpired();
    expect(result.redactedOutbox).toBeGreaterThanOrEqual(1);
    expect(await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: oldOutbox.id },
    })).toMatchObject({
      status: 'sent',
      recipient: 'redacted:retention',
      payload: { redacted: true, reason: 'telegram_retention_expired' },
    });
  });

  it('delivers one Telegram reply only once across concurrent relay workers', async () => {
    const identity = await prisma.telegramAgentIdentity.upsert({
      where: { customerId },
      create: {
        telegramUserId: '7001001',
        chatId: '7001001',
        kind: 'customer',
        customerId,
      },
      update: { active: true, chatId: '7001001' },
    });
    const outboxId = 'telegram:concurrent-relay:test';
    await prisma.outboxMessage.create({
      data: {
        id: outboxId,
        channel: 'telegram',
        recipient: identity.chatId,
        template: 'telegram_agent_reply',
        payload: { message: 'one delivery' },
        // The full suite intentionally leaves unrelated pending notifications
        // behind. Make this concurrency probe the first relay candidate instead
        // of assuming it happens to fall within the default oldest-50 window.
        createdAt: new Date(0),
      },
    });

    let signalEntered!: () => void;
    let releaseDelivery!: () => void;
    const entered = new Promise<void>((resolve) => { signalEntered = resolve; });
    const release = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    const deliver = jest.fn(async (message: { payload?: unknown }) => {
      const payload = message.payload;
      const isTarget = Boolean(
        payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        (payload as { message?: unknown }).message === 'one delivery',
      );
      if (isTarget) {
        signalEntered();
        await release;
      }
    });
    const relayA = new OutboxService(prisma, { deliver } as never);
    const relayB = new OutboxService(prisma, { deliver } as never);

    const first = relayA.relayPending();
    await entered;
    const second = relayB.relayPending();
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseDelivery();
    const results = await Promise.all([first, second]);

    const targetCalls = deliver.mock.calls.filter(([message]) => {
      const payload = message.payload;
      return payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        (payload as { message?: unknown }).message === 'one delivery';
    });
    expect(targetCalls).toHaveLength(1);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBeGreaterThanOrEqual(1);
    expect(await prisma.outboxMessage.findUniqueOrThrow({
      where: { id: outboxId },
    })).toMatchObject({ status: 'sent' });
  }, 90_000);
});

function update(updateId: number, telegramUserId: string, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: {
        id: Number(telegramUserId),
        is_bot: false,
        first_name: 'Test',
      },
      chat: { id: Number(telegramUserId), type: 'private' },
      text,
    },
  };
}

function replyText(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const payload = (input as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return '';
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}
