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
 * POS sale resume (LOGIC-012): when the first attempt dies between reservation and the
 * payment batch (provider/DB failure), a retry with the same clientSaleId must push the
 * existing sale through instead of dying on `reserved→reserved` 422 (quantity carts) or
 * `insufficient_stock` 409 (serialized carts, whose units are already reserved by this
 * very order). The same key with a different composition still conflicts (409).
 */
describe('POS sale resume after payment failure (integration)', () => {
  let prisma: PrismaService;
  let pos: PosService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let shifts: ShiftsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, approvals);
    shifts = new ShiftsService(prisma, audit);
    pos = new PosService(
      prisma,
      new CustomersService(prisma, audit, new SettingsService(prisma, audit)),
      shifts,
      units,
      orders,
      payments,
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

  afterEach(() => {
    jest.restoreAllMocks();
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
      data: { sku: `POS-RESUME-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    for (let n = 0; n < units; n += 1) {
      await prisma.deviceUnit.create({
        data: { imei: `IMEI-RESUME-${seq}-${n}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      });
    }
    return product;
  }

  it('resumes a sale stuck in reserved after a payment failure, then replays it', async () => {
    const product = await seedProduct(1);
    const dto = {
      staffId: 'staff_resume_pay',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'resume-key-pay',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_resume_pay');
    jest.spyOn(payments, 'payMany').mockRejectedValueOnce(new Error('provider down'));
    await expect(pos.sale(dto)).rejects.toThrow('provider down');

    // The attempt committed the order and the reservation; nothing was paid.
    const stuck = await prisma.order.findFirstOrThrow();
    expect(stuck.status).toBe('reserved');
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.deviceUnit.count({ where: { status: 'reserved' } })).toBe(1);

    const resumed = expectCompleted(await pos.sale(dto));
    expect(resumed.orderId).toBe(stuck.id);
    expect(resumed.status).toBe('paid');
    expect((resumed as { resumed?: boolean }).resumed).toBe(true);
    expect((resumed as { idempotent?: boolean }).idempotent).toBeUndefined();
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);

    // A further retry is a plain replay of the now-paid sale (LOGIC-006 path).
    const replay = expectCompleted(await pos.sale(dto));
    expect(replay.orderId).toBe(stuck.id);
    expect((replay as { idempotent?: boolean }).idempotent).toBe(true);
    expect((replay as { resumed?: boolean }).resumed).toBeUndefined();
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('resumes a sale whose first attempt died before fulfillment (order still created)', async () => {
    const product = await seedProduct(1);
    const dto = {
      staffId: 'staff_resume_created',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'resume-key-created',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_resume_created');
    jest.spyOn(orders, 'fulfill').mockRejectedValueOnce(new Error('stock lock timeout'));
    await expect(pos.sale(dto)).rejects.toThrow('stock lock timeout');

    const stuck = await prisma.order.findFirstOrThrow();
    expect(stuck.status).toBe('created');
    expect(await prisma.deviceUnit.count({ where: { status: 'in_stock' } })).toBe(1);

    const resumed = expectCompleted(await pos.sale(dto));
    expect(resumed.orderId).toBe(stuck.id);
    expect(resumed.status).toBe('paid');
    expect((resumed as { resumed?: boolean }).resumed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('resumes a serialized qty>1 sale whose units were split into per-unit rows', async () => {
    const product = await seedProduct(2);
    const dto = {
      staffId: 'staff_resume_split',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'resume-key-split',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 2 }],
    };
    await openShift('staff_resume_split');
    jest.spyOn(payments, 'payMany').mockRejectedValueOnce(new Error('provider down'));
    await expect(pos.sale(dto)).rejects.toThrow('provider down');
    expect(await prisma.orderItem.count()).toBe(2); // per-unit rows, not one qty:2 line

    const resumed = expectCompleted(await pos.sale(dto));
    expect(resumed.status).toBe('paid');
    expect(resumed.imeis).toHaveLength(2);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(2);
  });

  it('rejects the same key with a different cart while the sale is stuck, then still resumes', async () => {
    const product = await seedProduct(2);
    const dto = {
      staffId: 'staff_resume_conflict',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'resume-key-conflict',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_resume_conflict');
    jest.spyOn(payments, 'payMany').mockRejectedValueOnce(new Error('provider down'));
    await expect(pos.sale(dto)).rejects.toThrow('provider down');

    const err = await pos.sale({
      ...dto,
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 2 }],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_reused');

    // The conflicting retry neither duplicated nor cancelled the stuck sale.
    const stuck = await prisma.order.findFirstOrThrow();
    expect(stuck.status).toBe('reserved');
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(0);

    const resumed = expectCompleted(await pos.sale(dto));
    expect(resumed.orderId).toBe(stuck.id);
    expect(resumed.status).toBe('paid');
    expect(await prisma.deviceUnit.count({ where: { status: 'sold' } })).toBe(1);
  });

  it('rejects the same key with a different discount (different money) while stuck', async () => {
    const product = await seedProduct(1);
    const dto = {
      staffId: 'staff_resume_discount',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'resume-key-discount',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_resume_discount');
    jest.spyOn(payments, 'payMany').mockRejectedValueOnce(new Error('provider down'));
    await expect(pos.sale(dto)).rejects.toThrow('provider down');

    const err = await pos.sale({ ...dto, discountPct: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('idempotency_key_reused');
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('rejects resuming a stuck sale when the shift was closed before the retry', async () => {
    // Guards the second auto-open spot (inside resumeSale): if the cashier's
    // shift closes between the failed attempt and the retry, the resume must
    // fail closed rather than fabricate a fresh shift to push the sale through.
    const product = await seedProduct(1);
    const dto = {
      staffId: 'staff_resume_no_shift',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: 'resume-key-no-shift',
      lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
    };
    await openShift('staff_resume_no_shift');
    jest.spyOn(payments, 'payMany').mockRejectedValueOnce(new Error('provider down'));
    await expect(pos.sale(dto)).rejects.toThrow('provider down');

    const stuck = await prisma.order.findFirstOrThrow();
    expect(stuck.status).toBe('reserved');
    const openShiftRow = await shifts.currentOpen('staff_resume_no_shift');
    await shifts.close(
      openShiftRow!.id,
      { closeCash: 0 },
      'staff_resume_no_shift',
      'close-key-resume-no-shift',
    );

    const err = await pos.sale(dto).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('cash_shift_required');
    // The stuck sale is untouched: still reserved, still unpaid.
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.order.findFirstOrThrow()).status).toBe('reserved');
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.cashShift.count({ where: { staffId: 'staff_resume_no_shift', closedAt: null } })).toBe(0);
  });
});
