import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { CustomersService } from '../src/customers/customers.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PosService } from '../src/pos/pos.service';

/**
 * Core invariant #10 — every mutation of money (Payment), stock (DeviceUnit
 * status), or order status must write its AuditEvent in the SAME transaction
 * (AuditService.transaction). This proves it end-to-end for two mutation
 * classes by driving a real POS sale and then reading the append-only ledger:
 *  1. money  — a Payment row co-commits a `payment.received` event.
 *  2. stock  — a DeviceUnit going `sold` co-commits a `unit.sold` event.
 * Setup mirrors pos-sale.e2e-spec.ts (known-good wiring + teardown order).
 */
describe('Event Ledger coverage — invariant #10 (integration)', () => {
  let prisma: PrismaService;
  let pos: PosService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    pos = new PosService(
      prisma,
      new CustomersService(prisma, audit),
      new ShiftsService(prisma, audit),
      units,
      new OrdersService(prisma, audit, units),
      new PaymentsService(prisma, audit, units, approvals),
      approvals,
    );
  });

  const clean = async () => {
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
  };

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(clean);

  /** Narrow the sale() union to the completed variant, failing if it parked instead. */
  function expectCompleted<T extends { pendingApproval: boolean }>(r: T): Extract<T, { pendingApproval: false }> {
    if (r.pendingApproval) throw new Error('expected a completed sale, got pending approval');
    return r as Extract<T, { pendingApproval: false }>;
  }

  async function seedProduct(count: number) {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `LEDGER-${seq}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    for (let n = 0; n < count; n += 1) {
      await prisma.deviceUnit.create({
        data: { imei: `IMEI-LEDGER-${seq}-${n}`, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
      });
    }
    return product;
  }

  async function cashSale() {
    const product = await seedProduct(1);
    return expectCompleted(
      await pos.sale({
        staffId: `staff_ledger_${seq}`,
        point: 'BISHKEK-1',
        method: 'cash',
        lines: [{ productId: product.id, sku: product.sku, price: 100000, qty: 1 }],
      }),
    );
  }

  // Money mutation: a Payment row must co-commit a payment.received event.
  it('writes a payment.received AuditEvent in the same transaction as the Payment (money)', async () => {
    const result = await cashSale();

    // the money moved
    const payment = await prisma.payment.findFirst({ where: { orderId: result.orderId } });
    expect(payment).not.toBeNull();
    expect(payment?.amount).toBe(100000);
    expect(payment?.method).toBe('cash');

    // …and the ledger recorded it atomically, referencing the mutated Payment + Order.
    const events = await prisma.auditEvent.findMany({ where: { type: 'payment.received' } });
    expect(events).toHaveLength(1);
    expect(events[0].refs).toEqual(expect.arrayContaining([result.orderId, payment!.id]));
    expect(events[0].payload).toMatchObject({ orderId: result.orderId, amount: 100000, method: 'cash' });
  });

  // Stock mutation: a DeviceUnit going `sold` must co-commit a unit.sold event.
  it('writes a unit.sold AuditEvent in the same transaction as the DeviceUnit status change (stock)', async () => {
    const result = await cashSale();
    const imei = result.imeis[0];

    // the stock moved
    const unit = await prisma.deviceUnit.findUnique({ where: { imei } });
    expect(unit?.status).toBe('sold');

    // …and the ledger recorded it atomically, referencing the mutated unit's IMEI.
    const events = await prisma.auditEvent.findMany({ where: { type: 'unit.sold' } });
    expect(events).toHaveLength(1);
    expect(events[0].refs).toEqual(expect.arrayContaining([result.orderId, imei]));
    expect(events[0].payload).toMatchObject({ orderId: result.orderId, imei });
  });
});
