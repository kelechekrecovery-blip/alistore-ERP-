import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxService } from '../src/outbox/outbox.service';
import {
  DeliverableMessage,
  NotificationTransport,
} from '../src/outbox/outbox.types';

/** Test transport that records deliveries and can be made to fail. */
class RecordingTransport implements NotificationTransport {
  calls: DeliverableMessage[] = [];
  fail = false;
  async deliver(message: DeliverableMessage): Promise<void> {
    this.calls.push(message);
    if (this.fail) throw new Error('transport boom');
  }
}

describe('Outbox (transactional, integration)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
  });

  it('delivers a pending message, marks it sent, and never re-sends it', async () => {
    const transport = new RecordingTransport();
    const outbox = new OutboxService(prisma, transport);
    await outbox.enqueue({
      channel: 'sms',
      recipient: '+996700000001',
      template: 'order_paid',
      payload: { orderId: 'o1' },
    });

    const first = await outbox.relayPending();
    expect(first.sent).toBe(1);
    expect(transport.calls).toHaveLength(1);

    const row = await prisma.outboxMessage.findFirst();
    expect(row?.status).toBe('sent');
    expect(row?.sentAt).not.toBeNull();

    const second = await outbox.relayPending();
    expect(second.sent).toBe(0); // already sent — not re-delivered
    expect(transport.calls).toHaveLength(1);
  });

  it('retries a failing message and parks it as failed after the cap', async () => {
    const transport = new RecordingTransport();
    transport.fail = true;
    const outbox = new OutboxService(prisma, transport);
    await outbox.enqueue({
      channel: 'email',
      recipient: 'a@b.kg',
      template: 'order_paid',
    });

    for (let i = 0; i < 5; i += 1) {
      await outbox.relayPending();
      if (i < 4) {
        // Advance the persisted schedule instead of sleeping through backoff.
        await prisma.outboxMessage.updateMany({
          data: { nextAttemptAt: new Date(0) },
        });
      }
    }

    const row = await prisma.outboxMessage.findFirst();
    expect(row?.status).toBe('failed');
    expect(row?.attempts).toBe(5);
    expect(row?.lastError).toContain('boom');
  });

  it('enqueueOnTx commits atomically with the business transaction', async () => {
    const outbox = new OutboxService(prisma, new RecordingTransport());
    await prisma.$transaction(async (tx) => {
      await outbox.enqueueOnTx(tx, {
        channel: 'push',
        recipient: 'device-1',
        template: 'reservation_expired',
      });
    });
    const count = await prisma.outboxMessage.count({
      where: { template: 'reservation_expired' },
    });
    expect(count).toBe(1);
  });

  it('rolls the message back when the business transaction fails', async () => {
    const outbox = new OutboxService(prisma, new RecordingTransport());
    await prisma
      .$transaction(async (tx) => {
        await outbox.enqueueOnTx(tx, {
          channel: 'sms',
          recipient: '+996700000002',
          template: 'rollback_me',
        });
        throw new Error('business failed');
      })
      .catch(() => undefined);
    const count = await prisma.outboxMessage.count({
      where: { template: 'rollback_me' },
    });
    expect(count).toBe(0); // rolled back with the transaction
  });
});
