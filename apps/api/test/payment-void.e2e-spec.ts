import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { EventType } from '../src/audit/event-types';
import { PaymentsService } from '../src/payments/payments.service';

describe('Payment void (FIN-003E)', () => {
  let prisma: PrismaService;
  let payments: PaymentsService;
  const ids: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    payments = new PaymentsService(
      prisma,
      new AuditService(prisma),
      {} as never,
      {} as never,
    );
  });

  afterEach(async () => {
    if (ids.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { refs: { hasSome: ids } } });
      await prisma.payment.deleteMany({ where: { id: { in: ids } } });
      ids.length = 0;
    }
  });

  afterAll(async () => prisma.$disconnect());

  it('voids only pending payments and replays the same idempotency key exactly once', async () => {
    const payment = await prisma.payment.create({
      data: { amount: 5000, method: 'card', status: 'pending', txnId: `pending-void-${Date.now()}` },
    });
    ids.push(payment.id);

    const first = await payments.voidPending(payment.id, 'intent expired', 'staff:void-test', 'void-key-1');
    const replay = await payments.voidPending(payment.id, 'intent expired', 'staff:void-test', 'void-key-1');

    expect(first.status).toBe('voided');
    expect(replay.id).toBe(payment.id);
    expect(await prisma.auditEvent.count({ where: { type: EventType.PaymentVoided, refs: { has: payment.id } } })).toBe(1);
  });

  it('rejects received payments and idempotency-key reuse across payments', async () => {
    const received = await prisma.payment.create({
      data: { amount: 5000, method: 'card', status: 'received', txnId: `received-void-${Date.now()}` },
    });
    const pending = await prisma.payment.create({
      data: { amount: 3000, method: 'card', status: 'pending', txnId: `pending-void-2-${Date.now()}` },
    });
    ids.push(received.id, pending.id);

    await expect(payments.voidPending(received.id, 'too late', 'staff:void-test', 'void-key-2')).rejects.toThrow('pending');
    await payments.voidPending(pending.id, 'first use', 'staff:void-test', 'void-key-3');
    await expect(payments.voidPending(received.id, 'reused', 'staff:void-test', 'void-key-3')).rejects.toThrow('другого платежа');
  });
});
