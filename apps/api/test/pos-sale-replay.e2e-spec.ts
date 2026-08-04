import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { CustomersService } from '../src/customers/customers.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PosService } from '../src/pos/pos.service';
import { ConflictError } from '../src/common/errors';

/**
 * POS replay guard (LOGIC-006): an idempotency key is bound to the exact sale
 * composition. Reusing a key with a different cart conflicts instead of returning
 * someone else's receipt; a true retry (same key, same composition) replays
 * idempotently; the no-key fingerprint fallback flags its dedup instead of
 * silently substituting the sale.
 */
describe('POS sale replay (integration)', () => {
  let prisma: PrismaService;
  let pos: PosService;
  let shifts: ShiftsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    shifts = new ShiftsService(prisma, audit);
    pos = new PosService(
      prisma,
      new CustomersService(prisma, audit, new SettingsService(prisma, audit)),
      shifts,
      units,
      new OrdersService(prisma, audit, units),
      new PaymentsService(prisma, audit, units, approvals),
      approvals,
      new SettingsService(prisma, audit),
    );
  });

  /** A cashier must have an open shift before a counter sale (Event Ledger invariant). */
  function openShift(staffId: string, point = 'BISHKEK-1') {
    return shifts.open({ staffId, point, openCash: 0 }, staffId);
  }

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** What a POS sale posts to the journal: the receipt and the COGS behind it. */
  const POS_JOURNAL_SOURCES = ['payment.receipt', 'inventory.cogs'];

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    // Journal entries are keyed by a deterministic cart fingerprint, so identical
    // carts across tests collide with leftover entries (same as pos-sale.e2e-spec).
    await prisma.$transaction([
      prisma.accountingJournalLine.deleteMany({
        where: { entry: { sourceType: { in: POS_JOURNAL_SOURCES } } },
      }),
      prisma.accountingJournalEntry.deleteMany({
        where: { sourceType: { in: POS_JOURNAL_SOURCES } },
      }),
    ]);
  });

  /** Narrow the sale() union to the completed variant, failing if it parked instead. */
  function expectCompleted<T extends { pendingApproval: boolean }>(r: T): Extract<T, { pendingApproval: false }> {
    if (r.pendingApproval) throw new Error('expected a completed sale, got pending approval');
    return r as Extract<T, { pendingApproval: false }>;
  }

  async function seedProduct(units: number) {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `POS-REPLAY-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    for (let n = 0; n < units; n += 1) {
      await prisma.deviceUnit.create({
        data: { imei: `IMEI-REPLAY-${seq}-${n}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      });
    }
    return product;
  }

  it('rejects a replay that reuses the clientSaleId with a different cart (409)', async () => {
    const product = await seedProduct(1);
    await openShift('staff_replay_key');
    const first = expectCompleted(await pos.sale({
      staffId: 'staff_replay_key',
      point: 'BISHKEK-1',
      method: 'cash',
      clientSaleId: 'replay-key-1',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    }));

    const err = await pos.sale({
      staffId: 'staff_replay_key',
      point: 'BISHKEK-1',
      method: 'cash',
      clientSaleId: 'replay-key-1',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 2 }],
    }).catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_reused');
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
    // The original receipt is untouched.
    expect((await prisma.order.findFirstOrThrow()).id).toBe(first.orderId);
  });

  it("rejects a replay that reuses another cashier's sale key (409)", async () => {
    const product = await seedProduct(2);
    const dto = {
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'shared-counter-key',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_replay_owner');
    expectCompleted(await pos.sale({ ...dto, staffId: 'staff_replay_owner' }));

    // Same key, same cart, different cashier: returning the first receipt would hand
    // over someone else's sale.
    const err = await pos.sale({ ...dto, staffId: 'staff_replay_other' }).catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_reused');
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('keeps two distinct sales with an identical cart when each carries its own clientSaleId', async () => {
    const product = await seedProduct(2);
    const dto = {
      staffId: 'staff_replay_distinct',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_replay_distinct');

    const first = expectCompleted(await pos.sale({ ...dto, clientSaleId: 'distinct-sale-a' }));
    const second = expectCompleted(await pos.sale({ ...dto, clientSaleId: 'distinct-sale-b' }));

    expect(second.orderId).not.toBe(first.orderId);
    expect((second as { idempotent?: boolean }).idempotent).toBeUndefined();
    expect(await prisma.order.count()).toBe(2);
    expect(await prisma.payment.count()).toBe(2);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(2);
  });

  it('replays the exact same sale idempotently (same key, same composition)', async () => {
    const product = await seedProduct(2);
    const dto = {
      staffId: 'staff_replay_true',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'true-replay-1',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_replay_true');

    const first = expectCompleted(await pos.sale(dto));
    const retry = expectCompleted(await pos.sale(dto));

    expect(retry.orderId).toBe(first.orderId);
    expect((retry as { idempotent?: boolean }).idempotent).toBe(true);
    // An explicit-key replay is unambiguous — no fingerprint fallback involved.
    expect((retry as { dedupedBy?: string }).dedupedBy).toBeUndefined();
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('flags a no-key fingerprint dedup instead of silently substituting the sale (M-5)', async () => {
    const product = await seedProduct(2);
    const dto = {
      staffId: 'staff_replay_fingerprint',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_replay_fingerprint');

    const first = expectCompleted(await pos.sale(dto));
    const retry = expectCompleted(await pos.sale(dto)); // same cart, same window → same key

    expect(retry.orderId).toBe(first.orderId);
    expect((retry as { idempotent?: boolean }).idempotent).toBe(true);
    expect((retry as { dedupedBy?: string }).dedupedBy).toBe('fingerprint');
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });
});
