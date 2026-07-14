import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ProductsService } from '../src/products/products.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';

describe('Serialized consignment inventory (integration)', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  let products: ProductsService;
  let catalog: CatalogService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    const units = new UnitsService(prisma);
    inventory = new InventoryService(prisma, audit, approvals);
    products = new ProductsService(prisma, audit, approvals);
    catalog = new CatalogService(prisma, new ConfigService());
    orders = new OrdersService(prisma, audit, units);
    payments = new PaymentsService(prisma, audit, units, approvals);
  });

  beforeEach(() => clean());
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  async function clean() {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.consignmentItem.deleteMany();
    await prisma.consignmentPayout.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.return.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.customer.deleteMany();
  }

  async function serializedProduct(sku = `USED-${++seq}`) {
    return products.create({
      sku,
      name: 'Used iPhone 12',
      price: 50_000,
      cost: 0,
      category: 'used',
      trackingMode: 'serialized',
      attrs: { condition: 'B' },
    }, 'owner-consignment-test');
  }

  async function receive(productId: string, imei = `CONS-${seq}-001`) {
    return inventory.receiveConsignment({
      idempotencyKey: `receive-${imei}`,
      productId,
      imei,
      location: 'BISHKEK-1',
      ownerName: 'Клиент Б.',
      ownerContact: '+996555000111',
      commissionBps: 1000,
      grade: 'B',
    }, 'warehouse-consignment-test');
  }

  async function sell(productId: string, sku: string, imei: string) {
    const customer = await prisma.customer.create({
      data: { phone: `+996700${String(++seq).padStart(6, '0')}`, name: 'Consignment buyer' },
    });
    const order = await orders.create({
      customerId: customer.id,
      channel: 'pos',
      fulfillmentType: 'store',
      pickupPoint: 'BISHKEK-1',
      total: 50_000,
      items: [{ sku, qty: 1, price: 50_000, imei }],
    }, 'cashier-consignment-test');
    await orders.reserve(order.id, 'cashier-consignment-test');
    await payments.pay({ orderId: order.id, amount: 50_000, method: 'cash', txnId: `sale-${imei}` }, 'cashier-consignment-test');
    return order;
  }

  it('receives one owner-bound IMEI idempotently and exposes it as sellable stock', async () => {
    const product = await serializedProduct();
    const first = await receive(product.id);
    const replay = await receive(product.id);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({ ownerName: 'Клиент Б.', commissionBps: 1000, status: 'active' });
    expect(await prisma.deviceUnit.count({ where: { productId: product.id, status: 'in_stock' } })).toBe(1);
    const result = await catalog.search({ q: product.sku, stockOnly: true, limit: 10, offset: 0 });
    expect(result.items[0]).toMatchObject({ sku: product.sku, availableUnits: 1 });
    expect(await prisma.auditEvent.count({ where: { type: 'consignment.received' } })).toBe(1);
    await expect(inventory.receiveConsignment({
      idempotencyKey: `receive-${first.unit.imei}`,
      productId: product.id,
      imei: 'DIFFERENT-IMEI',
      location: 'BISHKEK-1',
      ownerName: 'Клиент Б.',
      ownerContact: '+996555000111',
      commissionBps: 1000,
      grade: 'B',
    }, 'warehouse-consignment-test')).rejects.toMatchObject({ code: 'consignment_idempotency_mismatch' });
  });

  it('accrues owner liability exactly once when web/POS payment sells the IMEI', async () => {
    const product = await serializedProduct();
    const item = await receive(product.id);
    const order = await sell(product.id, product.sku, item.unit.imei);
    await payments.pay({ orderId: order.id, amount: 50_000, method: 'cash', txnId: `sale-${item.unit.imei}` }, 'cashier-consignment-test');

    expect(await prisma.consignmentItem.findUnique({ where: { id: item.id } })).toMatchObject({
      status: 'sold',
      saleOrderId: order.id,
      salePrice: 50_000,
      commissionAmount: 5_000,
      ownerAmount: 45_000,
    });
    expect(await prisma.auditEvent.count({ where: { type: 'consignment.sold', refs: { has: item.id } } })).toBe(1);
  });

  it('creates and pays one payout only after completion, with stable replay keys', async () => {
    const product = await serializedProduct();
    const item = await receive(product.id);
    const order = await sell(product.id, product.sku, item.unit.imei);

    await expect(inventory.createConsignmentPayout({ idempotencyKey: 'payout-1', itemIds: [item.id] }, 'owner-test'))
      .rejects.toMatchObject({ code: 'consignment_not_settleable' });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });

    const payout = await inventory.createConsignmentPayout({ idempotencyKey: 'payout-1', itemIds: [item.id] }, 'owner-test');
    const replay = await inventory.createConsignmentPayout({ idempotencyKey: 'payout-1', itemIds: [item.id] }, 'owner-test');
    expect(replay.id).toBe(payout.id);
    await expect(inventory.createConsignmentPayout({ idempotencyKey: 'payout-1', itemIds: [] }, 'owner-test'))
      .rejects.toMatchObject({ code: 'consignment_idempotency_mismatch' });
    expect(payout).toMatchObject({ grossAmount: 50_000, commissionAmount: 5_000, ownerAmount: 45_000, status: 'created' });

    const paid = await inventory.payConsignmentPayout(payout.id, { paymentKey: 'bank-1' }, 'owner-test');
    const paidReplay = await inventory.payConsignmentPayout(payout.id, { paymentKey: 'bank-1' }, 'owner-test');
    expect(paid.status).toBe('paid');
    expect(paidReplay.status).toBe('paid');
    await expect(inventory.payConsignmentPayout(payout.id, { paymentKey: 'bank-2' }, 'owner-test'))
      .rejects.toMatchObject({ code: 'consignment_payment_key_reused' });
    expect((await prisma.consignmentItem.findUnique({ where: { id: item.id } }))?.status).toBe('settled');
    expect(await prisma.auditEvent.count({ where: { type: 'consignment.payout_paid' } })).toBe(1);
  });

  it('blocks settlement while a return is active and rejects bundle components', async () => {
    const product = await serializedProduct();
    const item = await receive(product.id);
    const order = await sell(product.id, product.sku, item.unit.imei);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'completed' } });
    await prisma.return.create({ data: { orderId: order.id, reason: 'changed mind' } });
    await expect(inventory.createConsignmentPayout({ idempotencyKey: 'payout-return', itemIds: [item.id] }, 'owner-test'))
      .rejects.toMatchObject({ code: 'consignment_return_pending' });

    const bundle = await serializedProduct(`BUNDLE-${++seq}`);
    await prisma.productBundleComponent.create({
      data: { bundleProductId: bundle.id, componentProductId: product.id, qty: 1 },
    });
    await expect(receive(product.id, `CONS-BUNDLE-${seq}`))
      .rejects.toMatchObject({ code: 'consignment_bundle_forbidden' });
  });
});
