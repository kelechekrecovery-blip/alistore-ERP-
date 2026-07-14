import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ReturnsService } from '../src/returns/returns.service';

describe('Refund-bound return reconciliation (integration)', () => {
  let prisma: PrismaService;
  let approvals: ApprovalsService;
  let payments: PaymentsService;
  let returns: ReturnsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    payments = new PaymentsService(prisma, audit, new UnitsService(prisma), approvals);
    returns = new ReturnsService(prisma, audit);
  });

  beforeEach(() => clean());
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  async function clean() {
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.consignmentAdjustment.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.consignmentItem.deleteMany();
    await prisma.consignmentPayout.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.orderBundleAllocation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  }

  async function moveToProcessing(returnId: string) {
    await returns.transition(returnId, 'under_review', 'staff:returns');
    await returns.transition(returnId, 'approved', 'staff:returns');
    await returns.transition(returnId, 'processing', 'staff:returns');
  }

  async function refundReturn(returnId: string, paymentId: string, amount: number) {
    const request = await payments.refund(paymentId, amount, 'accepted return', 'staff:returns', returnId);
    await approvals.decide(request.approvalId, {
      status: 'approved',
      approver: 'owner:refunds',
      approverRole: 'owner',
    });
  }

  it('restores quantity, direct IMEI and bundle IMEI exactly once after the full refund', async () => {
    const suffix = `${Date.now()}-${++seq}`;
    const customer = await prisma.customer.create({ data: { phone: `+996701${suffix.slice(-6)}`, name: 'Return QA' } });
    const quantity = await prisma.product.create({
      data: { sku: `Q-${suffix}`, name: 'Case', price: 1000, cost: 500, category: 'accessories', trackingMode: 'quantity', attrs: {} },
    });
    const phone = await prisma.product.create({
      data: { sku: `P-${suffix}`, name: 'Phone', price: 100000, cost: 80000, category: 'phones', attrs: {} },
    });
    const component = await prisma.product.create({
      data: { sku: `C-${suffix}`, name: 'Bundle phone', price: 90000, cost: 70000, category: 'phones', attrs: {} },
    });
    const bundle = await prisma.product.create({
      data: { sku: `B-${suffix}`, name: 'Bundle', price: 90000, cost: 70000, category: 'bundles', attrs: {} },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'web',
        status: 'paid',
        total: 193000,
        items: {
          create: [
            { sku: phone.sku, qty: 1, price: 100000, imei: `RET-DIRECT-${suffix}` },
            { sku: quantity.sku, qty: 3, price: 1000 },
            { sku: bundle.sku, qty: 1, price: 90000 },
          ],
        },
      },
      include: { items: true },
    });
    const balance = await prisma.inventoryBalance.create({
      data: { productId: quantity.id, location: 'SALE-FLOOR', onHand: 0 },
    });
    await prisma.orderQuantityAllocation.create({
      data: {
        orderId: order.id,
        orderItemId: order.items.find((item) => item.sku === quantity.sku)!.id,
        productId: quantity.id,
        balanceId: balance.id,
        sku: quantity.sku,
        qty: 3,
        active: false,
        consumedAt: new Date(),
      },
    });
    const directImei = `RET-DIRECT-${suffix}`;
    const bundleImei = `RET-BUNDLE-${suffix}`;
    await prisma.deviceUnit.createMany({
      data: [
        { imei: directImei, productId: phone.id, status: 'sold', location: 'SALE-FLOOR', orderId: order.id },
        { imei: bundleImei, productId: component.id, status: 'sold', location: 'SALE-FLOOR', orderId: order.id },
      ],
    });
    await prisma.orderBundleAllocation.create({
      data: {
        orderId: order.id,
        orderItemId: order.items.find((item) => item.sku === bundle.sku)!.id,
        bundleSku: bundle.sku,
        componentProductId: component.id,
        componentSku: component.sku,
        imei: bundleImei,
      },
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: order.total, method: 'card', status: 'received' },
    });
    const ret = await returns.request(order.id, 'full return', customer.id, customer.id, `return-${suffix}`);
    await moveToProcessing(ret.id);

    await expect(returns.transition(ret.id, 'paid', 'staff:returns')).rejects.toMatchObject({
      code: 'return_paid_by_refund_only',
    });
    await refundReturn(ret.id, payment.id, order.total);
    expect(await prisma.return.findUnique({ where: { id: ret.id } })).toMatchObject({ status: 'paid' });

    await returns.transition(ret.id, 'reconciled', 'staff:warehouse', 'RETURNS-BISHKEK');
    await returns.transition(ret.id, 'reconciled', 'staff:warehouse', 'RETURNS-BISHKEK');

    expect(await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: quantity.id, location: 'RETURNS-BISHKEK' } },
    })).toMatchObject({ onHand: 3, reserved: 0 });
    const units = await prisma.deviceUnit.findMany({ where: { imei: { in: [directImei, bundleImei] } } });
    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.status === 'in_stock' && unit.location === 'RETURNS-BISHKEK' && !unit.orderId)).toBe(true);
    expect(await prisma.inventoryMovement.count({ where: { type: 'return_restock' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'return.completed', refs: { has: ret.id } } })).toBe(1);
  });

  it('creates an owner compensation obligation instead of reselling a paid consignment return', async () => {
    const suffix = `${Date.now()}-${++seq}`;
    const customer = await prisma.customer.create({ data: { phone: `+996702${suffix.slice(-6)}`, name: 'Consignment QA' } });
    const product = await prisma.product.create({
      data: { sku: `CONS-${suffix}`, name: 'Used phone', price: 50000, cost: 0, category: 'used', attrs: {} },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        status: 'paid',
        total: 50000,
        items: { create: { sku: product.sku, qty: 1, price: 50000, imei: `CONS-RET-${suffix}` } },
      },
    });
    const unit = await prisma.deviceUnit.create({
      data: { imei: `CONS-RET-${suffix}`, productId: product.id, status: 'sold', location: 'STORE', orderId: order.id },
    });
    const payout = await prisma.consignmentPayout.create({
      data: {
        idempotencyKey: `payout-${suffix}`,
        ownerName: 'Owner A',
        grossAmount: 50000,
        commissionAmount: 5000,
        ownerAmount: 45000,
        status: 'paid',
        paymentKey: `paid-${suffix}`,
        createdBy: 'owner',
        paidBy: 'owner',
        paidAt: new Date(),
      },
    });
    const item = await prisma.consignmentItem.create({
      data: {
        idempotencyKey: `item-${suffix}`,
        unitId: unit.id,
        productId: product.id,
        ownerName: 'Owner A',
        commissionBps: 1000,
        status: 'settled',
        saleOrderId: order.id,
        salePrice: 50000,
        commissionAmount: 5000,
        ownerAmount: 45000,
        soldAt: new Date(),
        payoutId: payout.id,
        createdBy: 'staff',
      },
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: 50000, method: 'cash', status: 'received' },
    });
    const ret = await returns.request(order.id, 'consignment return', customer.id, customer.id, `return-${suffix}`);
    await moveToProcessing(ret.id);
    await refundReturn(ret.id, payment.id, 50000);
    await returns.transition(ret.id, 'reconciled', 'staff:warehouse', 'OWNER-RETURNS');
    await returns.transition(ret.id, 'reconciled', 'staff:warehouse', 'OWNER-RETURNS');

    expect(await prisma.consignmentItem.findUnique({ where: { id: item.id } })).toMatchObject({ status: 'withdrawn', payoutId: payout.id });
    expect(await prisma.deviceUnit.findUnique({ where: { id: unit.id } })).toMatchObject({ status: 'returned', location: 'OWNER-RETURNS', orderId: null });
    expect(await prisma.consignmentAdjustment.findUnique({
      where: { returnId_itemId: { returnId: ret.id, itemId: item.id } },
    })).toMatchObject({ payoutId: payout.id, amount: 45000, status: 'open' });
    expect(await prisma.consignmentAdjustment.count()).toBe(1);
  });

  it('removes every returned item from the same unpaid payout and cancels the empty batch', async () => {
    const suffix = `${Date.now()}-${++seq}`;
    const customer = await prisma.customer.create({ data: { phone: `+996703${suffix.slice(-6)}`, name: 'Unpaid payout QA' } });
    const product = await prisma.product.create({
      data: { sku: `CONS-MULTI-${suffix}`, name: 'Used devices', price: 50000, cost: 0, category: 'used', attrs: {} },
    });
    const imeis = [`CONS-A-${suffix}`, `CONS-B-${suffix}`];
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        channel: 'pos',
        status: 'paid',
        total: 100000,
        items: { create: imeis.map((imei) => ({ sku: product.sku, qty: 1, price: 50000, imei })) },
      },
    });
    const units = await Promise.all(imeis.map((imei) => prisma.deviceUnit.create({
      data: { imei, productId: product.id, status: 'sold', location: 'STORE', orderId: order.id },
    })));
    const payout = await prisma.consignmentPayout.create({
      data: {
        idempotencyKey: `payout-multi-${suffix}`,
        ownerName: 'Owner B',
        grossAmount: 100000,
        commissionAmount: 10000,
        ownerAmount: 90000,
        createdBy: 'owner',
      },
    });
    await Promise.all(units.map((unit, index) => prisma.consignmentItem.create({
      data: {
        idempotencyKey: `item-multi-${suffix}-${index}`,
        unitId: unit.id,
        productId: product.id,
        ownerName: 'Owner B',
        commissionBps: 1000,
        status: 'sold',
        saleOrderId: order.id,
        salePrice: 50000,
        commissionAmount: 5000,
        ownerAmount: 45000,
        soldAt: new Date(),
        payoutId: payout.id,
        createdBy: 'staff',
      },
    })));
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'cash', status: 'received' },
    });
    const ret = await returns.request(order.id, 'two consignment items', customer.id, customer.id, `return-${suffix}`);
    await moveToProcessing(ret.id);
    await refundReturn(ret.id, payment.id, 100000);
    await returns.transition(ret.id, 'reconciled', 'staff:warehouse', 'RETURNS-BISHKEK');

    expect(await prisma.consignmentPayout.findUnique({ where: { id: payout.id } })).toMatchObject({
      grossAmount: 0,
      commissionAmount: 0,
      ownerAmount: 0,
      status: 'cancelled',
    });
    const returnedItems = await prisma.consignmentItem.findMany({ where: { saleOrderId: null } });
    expect(returnedItems).toHaveLength(2);
    expect(returnedItems.every((item) => item.status === 'active' && item.payoutId === null)).toBe(true);
    expect(await prisma.consignmentAdjustment.count()).toBe(0);
  });
});
