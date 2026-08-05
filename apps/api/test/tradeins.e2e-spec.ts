import { AuditService } from '../src/audit/audit.service';
import { ConflictError } from '../src/common/errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { TradeInsService } from '../src/tradeins/tradeins.service';

describe('Trade-ins (integration)', () => {
  let prisma: PrismaService;
  let tradeIns: TradeInsService;
  let audit: AuditService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    audit = new AuditService(prisma);
    tradeIns = new TradeInsService(prisma, audit);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.supplierRma.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.payment.deleteMany({ where: { serviceWorkOrderId: { not: null } } });
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.debtPlan.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+9967099${seq.toString().padStart(4, '0')}`, name: 'Trade Seller' },
    });
  }

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  it('creates a trade-in contract, masks passport in response, and writes ledger events', async () => {
    const seller = await customer();

    const tradeIn = await tradeIns.create({
      customerId: seller.id,
      model: 'iPhone 13 Pro 256GB',
      grade: 'B',
      price: 42000,
      sellerPassport: 'ID1234567',
    }, seller.id, 'tradein-create-once');

    expect(tradeIn.contractId).toMatch(/^TI-\d{8}-[A-F0-9]{6}$/);
    expect(tradeIn.sellerPassportMasked).toBe('ID1***67');
    expect(tradeIn).not.toHaveProperty('sellerPassport');

    const stored = await prisma.tradeInDevice.findUnique({ where: { id: tradeIn.id } });
    expect(stored?.sellerPassport).toBe('ID1234567');
    expect(stored?.contractId).toBe(tradeIn.contractId);

    const events = await prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } });
    expect(events.map((event) => event.type)).toEqual([
      'tradein.assessed',
      'tradein.contracted',
    ]);
    expect(events[0].refs).toEqual(expect.arrayContaining([tradeIn.id, seller.id]));
  });

  it('rejects a trade-in for an unknown customer', async () => {
    const err = await tradeIns
      .create({
        customerId: 'missing',
        model: 'iPhone 11',
        grade: 'C',
        price: 15000,
        sellerPassport: 'ID7654321',
      }, 'missing-actor', 'tradein-missing-customer')
      .catch((e) => e);

    expect(err.code).toBe('customer_session_revoked');
    expect(await prisma.tradeInDevice.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('replays an exact request and rejects a reused key with changed data', async () => {
    const seller = await customer();
    const input = {
      customerId: seller.id,
      model: 'iPhone 13 Pro 256GB',
      grade: 'B' as const,
      price: 42000,
      sellerPassport: 'ID1234567',
    };

    const first = await tradeIns.create(input, seller.id, 'tradein-replay');
    const replay = await tradeIns.create(input, seller.id, 'tradein-replay');
    expect(replay.id).toBe(first.id);
    expect(await prisma.tradeInDevice.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'tradein.assessed' } })).toBe(1);

    const reused = await tradeIns
      .create({ ...input, price: 1 }, seller.id, 'tradein-replay')
      .catch((error) => error);
    expect(reused).toBeInstanceOf(ConflictError);
    expect(reused.code).toBe('idempotency_key_reused');
  });

  it('rejects replaying a self-service key as a staff cash payout', async () => {
    const seller = await customer();
    const input = {
      customerId: seller.id,
      model: 'iPhone cross-mode replay',
      grade: 'B' as const,
      price: 22000,
      sellerPassport: 'ID-CROSS-MODE',
    };
    const first = await tradeIns.create(input, seller.id, 'tradein-cross-mode', false);

    await expect(tradeIns.create(input, 'staff-intake', 'tradein-cross-mode', true))
      .rejects.toMatchObject({ code: 'idempotency_key_reused' });
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'tradein.buyback', sourceRef: first.id },
    })).toBe(0);
    expect(await prisma.cashDrawerMovement.count({
      where: { sourceType: 'tradein.buyback', sourceRef: first.id },
    })).toBe(0);
  });

  it('does not restore passport PII when deletion commits before trade-in writes', async () => {
    const seller = await customer();
    const atTransaction = deferred();
    const resumeTransaction = deferred();
    const originalTransaction = audit.transaction.bind(audit);
    const transaction = jest.spyOn(audit, 'transaction').mockImplementationOnce(async (fn) => {
      atTransaction.resolve();
      await resumeTransaction.promise;
      return originalTransaction(fn);
    });

    try {
      const creation = tradeIns.create({
        customerId: seller.id,
        model: 'iPhone deletion race',
        grade: 'B',
        price: 25000,
        sellerPassport: 'ID-DO-NOT-RESTORE',
      }, seller.id, 'tradein-delete-race');
      await atTransaction.promise;
      await prisma.customer.update({
        where: { id: seller.id },
        data: { phone: `deleted:${seller.id}`, name: 'Удалённый пользователь' },
      });
      resumeTransaction.resolve();

      await expect(creation).rejects.toMatchObject({ code: 'customer_session_revoked' });
      expect(await prisma.tradeInDevice.count({ where: { idempotencyKey: 'tradein-delete-race' } }))
        .toBe(0);
      expect(await prisma.auditEvent.count({ where: { actor: seller.id } })).toBe(0);
    } finally {
      resumeTransaction.resolve();
      transaction.mockRestore();
    }
  });

  it('does not expose an idempotent trade-in replay after account deletion', async () => {
    const seller = await customer();
    const input = {
      customerId: seller.id,
      model: 'iPhone replay deletion',
      grade: 'C' as const,
      price: 10000,
      sellerPassport: 'ID-REPLAY-DELETE',
    };
    await tradeIns.create(input, seller.id, 'tradein-delete-replay');
    await prisma.customer.update({
      where: { id: seller.id },
      data: { phone: `deleted:${seller.id}`, name: 'Удалённый пользователь' },
    });

    await expect(tradeIns.create(input, seller.id, 'tradein-delete-replay'))
      .rejects.toMatchObject({ code: 'customer_session_revoked' });
  });

  it('keeps customer records owner-scoped', async () => {
    const seller = await customer();
    const other = await customer();
    const tradeIn = await tradeIns.create({
      customerId: seller.id,
      model: 'iPhone 13',
      grade: 'C',
      price: 15000,
      sellerPassport: 'ID7654321',
    }, seller.id, 'tradein-owned');

    expect(await tradeIns.getOwned(tradeIn.id, seller.id)).not.toBeNull();
    expect(await tradeIns.getOwned(tradeIn.id, other.id)).toBeNull();
    expect(await tradeIns.listByCustomer(seller.id)).toHaveLength(1);
    expect(await tradeIns.listByCustomer(other.id)).toHaveLength(0);
  });
});
