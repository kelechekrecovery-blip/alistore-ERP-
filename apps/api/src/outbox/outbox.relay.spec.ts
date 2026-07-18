import { ConfigService } from '@nestjs/config';
import { AlerterService } from '../observability/alerter.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxRelay } from './outbox.relay';
import { OutboxService } from './outbox.service';

function relay(config: Record<string, string>): OutboxRelay {
  return new OutboxRelay(
    new ConfigService(config),
    { relayPending: jest.fn() } as unknown as OutboxService,
    { notifyCritical: jest.fn() } as unknown as AlerterService,
    { workerHeartbeat: { upsert: jest.fn() } } as unknown as PrismaService,
  );
}

describe('OutboxRelay runtime boundary', () => {
  it('does not connect when relay is disabled', async () => {
    await expect(relay({}).onModuleInit()).resolves.toBeUndefined();
  });

  it('fails a BullMQ worker fast when REDIS_URL is missing', async () => {
    await expect(
      relay({
        OUTBOX_RELAY_ENABLED: 'true',
        JOB_BACKEND: 'bullmq',
        PROCESS_ROLE: 'worker',
      }).onModuleInit(),
    ).rejects.toThrow('REDIS_URL is required');
  });

  it('lets the API degrade when BullMQ is unavailable at configuration time', async () => {
    await expect(
      relay({
        OUTBOX_RELAY_ENABLED: 'true',
        JOB_BACKEND: 'bullmq',
        PROCESS_ROLE: 'api',
      }).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
