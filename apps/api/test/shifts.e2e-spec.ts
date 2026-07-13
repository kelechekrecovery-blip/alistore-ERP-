import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ConflictError, ValidationError } from '../src/common/errors';

/**
 * Cash shift reconciliation (invariant #3 + Payment Ledger money contour):
 *   - a shift reconciles to diff 0 when the drawer matches openCash + cash payments
 *   - a discrepancy with no reason is rejected (422); with a reason it is recorded
 *     and a cash.shortage event is written
 *   - one open shift per staff; a closed shift cannot be closed again
 *   - a payment tagged with shiftId attributes to the drawer end-to-end
 */
describe('Cash shift reconciliation (integration)', () => {
  let prisma: PrismaService;
  let shifts: ShiftsService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let units: UnitsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    units = new UnitsService(prisma);
    shifts = new ShiftsService(prisma, audit);
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, new ApprovalsService(prisma, audit));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.cashShift.deleteMany();
  });

  const staff = () => {
    seq += 1;
    return `staff_${seq}`;
  };

  it('reconciles to diff 0 when the drawer matches openCash + cash payments', async () => {
    const shift = await shifts.open(
      { staffId: staff(), point: 'BISHKEK-1', openCash: 5000 },
      'cashier',
    );
    await prisma.payment.createMany({
      data: [
        { amount: 100000, method: 'cash', status: 'received', shiftId: shift.id },
        { amount: 50000, method: 'cash', status: 'received', shiftId: shift.id },
        // a card payment must NOT count toward drawer cash
        { amount: 30000, method: 'card', status: 'received', shiftId: shift.id },
      ],
    });

    const closed = await shifts.close(shift.id, { closeCash: 155000 }, 'cashier');
    expect(closed.expected).toBe(155000);
    expect(closed.diff).toBe(0);

    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: shift.id } },
    });
    expect(shortage).toBeNull();
  });

  it('rejects a discrepancy with no reason (422), then records it with a reason', async () => {
    const shift = await shifts.open(
      { staffId: staff(), point: 'BISHKEK-1', openCash: 5000 },
      'cashier',
    );
    await prisma.payment.create({
      data: { amount: 100000, method: 'cash', status: 'received', shiftId: shift.id },
    });
    // expected = 105000; counted 100000 → diff -5000

    const err = await shifts
      .close(shift.id, { closeCash: 100000 }, 'cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.getStatus()).toBe(422);
    expect(err.code).toBe('reconciliation_reason_required');

    // still open — can be closed with a reason
    const closed = await shifts.close(
      shift.id,
      { closeCash: 100000, reason: 'недостача, разбор с продавцом' },
      'cashier',
    );
    expect(closed.diff).toBe(-5000);

    const shortage = await prisma.auditEvent.findFirst({
      where: { type: 'cash.shortage', refs: { has: shift.id } },
    });
    expect(shortage).not.toBeNull();
  });

  it('allows only one open shift per staff (409)', async () => {
    const staffId = staff();
    await shifts.open({ staffId, point: 'BISHKEK-1', openCash: 5000 }, 'cashier');
    const err = await shifts
      .open({ staffId, point: 'BISHKEK-1', openCash: 5000 }, 'cashier')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('shift_already_open');
  });

  it('serializes concurrent open replay and emits one ledger event', async () => {
    const staffId = staff();
    const command = { staffId, point: 'BISHKEK-1', openCash: 5000 };
    const [first, second] = await Promise.all([
      shifts.open(command, staffId, 'shift-open-replay'),
      shifts.open(command, staffId, 'shift-open-replay'),
    ]);
    expect(first.id).toBe(second.id);
    await expect(prisma.cashShift.count({ where: { staffId, closedAt: null } })).resolves.toBe(1);
    await expect(prisma.auditEvent.count({ where: { type: 'shift.opened', refs: { has: first.id } } })).resolves.toBe(1);

    const mismatch = await shifts
      .open({ ...command, openCash: 9000 }, staffId, 'shift-open-replay')
      .catch((error) => error);
    expect(mismatch).toBeInstanceOf(ConflictError);
    expect(mismatch.code).toBe('shift_idempotency_mismatch');
  });

  it('exact-replays concurrent close and rejects changed payload reuse', async () => {
    const staffId = staff();
    const shift = await shifts.open(
      { staffId, point: 'BISHKEK-1', openCash: 5000 },
      staffId,
      'shift-close-open',
    );
    const [first, second] = await Promise.all([
      shifts.close(shift.id, { closeCash: 5000 }, staffId, 'shift-close-replay'),
      shifts.close(shift.id, { closeCash: 5000 }, staffId, 'shift-close-replay'),
    ]);
    expect(first.id).toBe(second.id);
    await expect(prisma.auditEvent.count({ where: { type: 'shift.closed', refs: { has: shift.id } } })).resolves.toBe(1);

    const mismatch = await shifts
      .close(shift.id, { closeCash: 5100, reason: 'changed' }, staffId, 'shift-close-replay')
      .catch((error) => error);
    expect(mismatch).toBeInstanceOf(ConflictError);
    expect(mismatch.code).toBe('shift_idempotency_mismatch');
  });

  it('rejects closing an already-closed shift (409)', async () => {
    const shift = await shifts.open(
      { staffId: staff(), point: 'BISHKEK-1', openCash: 0 },
      'cashier',
    );
    await shifts.close(shift.id, { closeCash: 0 }, 'cashier');
    const err = await shifts.close(shift.id, { closeCash: 0 }, 'cashier').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('shift_already_closed');
  });

  it('attributes a payment tagged with shiftId to the drawer end-to-end', async () => {
    seq += 1;
    const suffix = seq.toString().padStart(3, '0');
    const shift = await shifts.open(
      { staffId: staff(), point: 'BISHKEK-1', openCash: 0 },
      'cashier',
    );
    const customer = await prisma.customer.create({
      data: { phone: `+9967001${suffix}`, name: 'Тест' },
    });
    const product = await prisma.product.create({
      data: { sku: `SKU-S-${suffix}`, name: 'iPhone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    const imei = `IMEI-S-${suffix}`;
    await units.receive({ imei, productId: product.id, location: 'BISHKEK-1' });

    const order = await orders.create(
      {
        customerId: customer.id,
        channel: 'pos',
        total: 100000,
        items: [{ sku: product.sku, qty: 1, price: 100000, imei }],
      },
      'seller',
    );
    await orders.reserve(order.id, 'seller');
    const paid = await payments.pay(
      { orderId: order.id, method: 'cash', amount: 100000, shiftId: shift.id },
      'cashier',
    );
    expect(paid.payment.shiftId).toBe(shift.id);

    // drawer reconciles to exactly the cash sale
    const closed = await shifts.close(shift.id, { closeCash: 100000 }, 'cashier');
    expect(closed.expected).toBe(100000);
    expect(closed.diff).toBe(0);
  });
});
