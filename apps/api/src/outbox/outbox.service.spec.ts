import { OutboxService } from './outbox.service';

describe('OutboxService retry policy', () => {
  it('does not claim a push message sent when the recipient has no device', async () => {
    const transport = { deliver: jest.fn().mockRejectedValue(new Error('push_recipient_unavailable')) };
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      outboxMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-1',
            channel: 'push',
            recipient: 'staff-1',
            template: 'task_assigned',
            payload: {},
            status: 'pending',
            attempts: 0,
            nextAttemptAt: new Date(Date.now() - 1_000),
          },
        ]),
        update,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({ status: 'pending', attempts: 1 }),
    }));
    const retry = update.mock.calls[0][0].data.nextAttemptAt as Date;
    expect(retry.getTime()).toBeGreaterThan(Date.now());
  });

  it('parks the fifth failure and clears the retry schedule', async () => {
    const transport = { deliver: jest.fn().mockRejectedValue(new Error('provider_down')) };
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      outboxMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-2',
            channel: 'push',
            recipient: 'staff-2',
            template: 'task_assigned',
            payload: {},
            status: 'pending',
            attempts: 4,
            nextAttemptAt: new Date(Date.now() - 1_000),
          },
        ]),
        update,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', attempts: 5, nextAttemptAt: null }),
    }));
  });

  it('clears the retry schedule after a successful delivery', async () => {
    const transport = { deliver: jest.fn().mockResolvedValue(undefined) };
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      outboxMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'outbox-3',
            channel: 'push',
            recipient: 'staff-3',
            template: 'task_assigned',
            payload: {},
            status: 'pending',
            attempts: 2,
            nextAttemptAt: new Date(Date.now() - 1_000),
          },
        ]),
        update,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'sent', sentAt: expect.any(Date), nextAttemptAt: null }),
    }));
  });
});
