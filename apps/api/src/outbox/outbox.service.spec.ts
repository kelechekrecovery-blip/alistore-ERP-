import { OutboxService } from './outbox.service';

describe('OutboxService retry policy', () => {
  it('uses an immutable upsert for a stable business dedup key', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { outboxMessage: { upsert } };
    const service = new OutboxService(
      prisma as never,
      { deliver: jest.fn() } as never,
    );
    const input = {
      channel: 'sms' as const,
      recipient: '+996700000001',
      template: 'supply_ready',
      dedupKey: 'supply:supply_ready:event-1',
      payload: { orderId: 'order-1' },
    };

    await service.enqueue(input);
    await service.enqueue(input);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].where.id).toBe(upsert.mock.calls[1][0].where.id);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });

  it('does not claim a push message sent when the recipient has no device', async () => {
    const transport = { deliver: jest.fn().mockRejectedValue(new Error('push_recipient_unavailable')) };
    const update = jest.fn().mockResolvedValue(undefined);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
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
        updateMany,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'outbox-1' }),
      data: expect.objectContaining({ status: 'pending', attempts: 1 }),
    }));
    const retry = updateMany.mock.calls[1][0].data.nextAttemptAt as Date;
    expect(retry.getTime()).toBeGreaterThan(Date.now());
  });

  it('parks the fifth failure and clears the retry schedule', async () => {
    const transport = { deliver: jest.fn().mockRejectedValue(new Error('provider_down')) };
    const update = jest.fn().mockResolvedValue(undefined);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
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
        updateMany,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', attempts: 5, nextAttemptAt: null }),
    }));
  });

  it('clears the retry schedule after a successful delivery', async () => {
    const transport = { deliver: jest.fn().mockResolvedValue(undefined) };
    const update = jest.fn().mockResolvedValue(undefined);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
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
        updateMany,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'sent', sentAt: expect.any(Date), nextAttemptAt: null }),
    }));
  });

  it('claims a pending row once when two relays race', async () => {
    let state: 'pending' | 'processing' | 'sent' = 'pending';
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const message = {
      id: 'outbox-race',
      channel: 'push',
      recipient: 'staff-race',
      template: 'task_assigned',
      payload: {},
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(Date.now() - 1_000),
    };
    const findMany = jest.fn().mockReturnValue([message]);
    const updateMany = jest.fn(async ({ where, data }: { where: { id: string }; data: { status: 'processing' | 'sent' } }) => {
      if (where.id !== message.id || state !== 'pending') return { count: 0 };
      state = data.status === 'processing' ? 'processing' : state;
      return { count: 1 };
    });
    const update = jest.fn(async () => { state = 'sent'; });
    const transport = {
      deliver: jest.fn(async () => gate),
    };
    const prisma = { outboxMessage: { findMany, updateMany, update } };
    const first = new OutboxService(prisma as never, transport as never).relayPending();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(transport.deliver).toHaveBeenCalledTimes(1);
    const second = new OutboxService(prisma as never, transport as never).relayPending();
    await expect(second).resolves.toEqual({ sent: 0, failed: 0 });
    release();
    await expect(first).resolves.toEqual({ sent: 1, failed: 0 });
    expect(transport.deliver).toHaveBeenCalledTimes(1);
    expect(state).toBe('sent');
  });

  it('reclaims a processing row after its lease expires', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const transport = { deliver: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      outboxMessage: {
        findMany: jest.fn().mockReturnValue([{
          id: 'outbox-stale',
          channel: 'email',
          recipient: 'owner@example.test',
          template: 'daily_briefing',
          payload: {},
          status: 'processing',
          attempts: 1,
          nextAttemptAt: new Date(Date.now() - 1_000),
        }]),
        updateMany,
        update,
      },
    };
    const service = new OutboxService(prisma as never, transport as never);

    await expect(service.relayPending()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(transport.deliver).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({ id: 'outbox-stale' }),
      data: expect.objectContaining({ status: 'processing', nextAttemptAt: expect.any(Date) }),
    }));
  });
});
