import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { CourierService } from '../src/courier/courier.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { OrderLineSupplyService } from '../src/procurement/order-line-supply.service';
import { FeatureFlagsService } from '../src/feature-flags/feature-flags.service';

/**
 * Slice 3 of docs/SUPPLY-TO-ORDER-PLAN.md — the supplier purchase order behind
 * a to-order customer order. Re-keys the sale guard from "product is to_order"
 * to "this order line's supply is not yet received" and proves the four call
 * sites (reserve, fulfill, pay, COD-on-delivery) stay in lockstep.
 */
describe('Order-line supply (slice 3)', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let inventory: InventoryService;
  let courier: CourierService;
  let supply: OrderLineSupplyService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    const config = new ConfigService({
      TO_ORDER_CHECKOUT_ENABLED: 'true',
      SUPPLY_PARTIAL_HANDOVER_ENABLED: 'true',
    });
    const flags = new FeatureFlagsService(prisma, config, audit);
    orders = new OrdersService(
      prisma,
      audit,
      units,
      undefined,
      config,
      undefined,
      undefined,
      undefined,
      undefined,
      flags,
    );
    payments = new PaymentsService(prisma, audit, units, approvals);
    inventory = new InventoryService(prisma, audit, approvals);
    const outbox = new OutboxService(prisma, { deliver: async () => undefined });
    courier = new CourierService(prisma, audit, outbox, units);
    supply = new OrderLineSupplyService(
      prisma,
      audit,
      units,
      flags,
    );
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(() => clean());

  async function clean() {
    await prisma.auditEvent.deleteMany();
    await prisma.orderLineSupply.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.courierCommand.deleteMany();
    await prisma.outboxMessage.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.paymentReceivableAllocation.deleteMany();
    await prisma.orderReceivable.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.supplierOffer.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: `s3-courier-${runId}` } } });
  }

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+99670085${seq.toString().padStart(4, '0')}`, name: 'Supply-3 buyer' },
    });
  }

  async function supplier() {
    seq += 1;
    return prisma.supplier.create({ data: { name: `Bishkek Supplier ${seq}` } });
  }

  async function toOrderProduct(overrides: Record<string, unknown> = {}) {
    seq += 1;
    const quoteSupplier = await prisma.supplier.create({
      data: { name: `Supply quote supplier ${seq}` },
    });
    return prisma.product.create({
      data: {
        sku: `S3-TO-ORDER-${seq}`,
        name: 'Под заказ',
        price: 60_000,
        cost: 45_000,
        category: 'phones',
        trackingMode: 'quantity',
        supplyMode: 'to_order',
        supplyLeadDays: 10,
        attrs: {},
        supplierId: quoteSupplier.id,
        supplierOffers: {
          create: {
            supplierId: quoteSupplier.id,
            unitCost: 45_000,
            availableQty: 10,
            leadDays: 10,
            checkedAt: new Date(),
            validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
            updatedBy: 'test',
          },
        },
        ...overrides,
      },
    });
  }

  async function toOrderOrder(product: { sku: string; price: number }, buyerId: string) {
    seq += 1;
    return orders.createFromCatalog({
      customerId: buyerId,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyerId, `s3-order-${seq}`);
  }

  async function placeLegacySupplierOrder(
    orderItemId: string,
    dto: { supplierId: string; unitCost: number },
    actor = 'staff',
  ) {
    // Compatibility coverage for request-only orders created before deposits
    // existed. New orders use settleReceivable → draft PO → Procurement.send.
    await prisma.orderLineSupply.update({
      where: { orderItemId },
      data: { status: 'awaiting_supplier' },
    });
    return supply.placeSupplierOrder(orderItemId, dto, actor);
  }

  async function markLegacyReceived(orderItemId: string, actor = 'staff') {
    const row = await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId } });
    await prisma.orderLineSupply.update({
      where: { orderItemId },
      data: { receivedQty: row.orderedQty },
    });
    return supply.markReceived(orderItemId, actor);
  }

  it('auto-creates an OrderLineSupply row at awaiting_supplier when a to_order order is created', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();

    const order = await toOrderOrder(product, buyer.id);

    const row = await prisma.orderLineSupply.findUnique({ where: { orderItemId: order.items[0].id } });
    expect(row).toMatchObject({ status: 'awaiting_deposit', purchaseOrderItemId: null });
  });

  it('does not create an OrderLineSupply row for an own-stock order', async () => {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `S3-OWN-${seq}`, name: 'Свой сток', price: 10_000, cost: 6_000, category: 'accessories', trackingMode: 'quantity', attrs: {} },
    });
    await inventory.receiveQuantity({ idempotencyKey: `s3-recv-${seq}`, productId: product.id, location: 'BISHKEK-1', quantity: 5 }, 'warehouse');
    const buyer = await customer();

    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `s3-own-${seq}`);

    expect(await prisma.orderLineSupply.count({ where: { orderItemId: order.items[0].id } })).toBe(0);
  });

  it('placeSupplierOrder transitions awaiting_supplier → ordered, creates one PurchaseOrderItem, and writes the ledger', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    const sup = await supplier();

    const result = await placeLegacySupplierOrder(order.items[0].id, {
      supplierId: sup.id,
      unitCost: 45_000,
    }, 'staff-owner');

    expect(result).toMatchObject({ status: 'ordered', idempotent: false });
    expect(result.purchaseOrderItemId).not.toBeNull();
    expect(await prisma.purchaseOrderItem.count()).toBe(1);
    const poItem = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: result.purchaseOrderItemId! } });
    expect(poItem).toMatchObject({ orderedQty: 1, unitCost: 45_000, productId: product.id });
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { type: 'order_line_supply.ordered', refs: { has: order.id } } });
    expect(event.payload).toMatchObject({ orderItemId: order.items[0].id, purchaseOrderItemId: result.purchaseOrderItemId });
  });

  it('rejects placeSupplierOrder on a line that has no OrderLineSupply row (own-stock)', async () => {
    seq += 1;
    const product = await prisma.product.create({
      data: { sku: `S3-OWN-REJECT-${seq}`, name: 'Свой сток', price: 10_000, cost: 6_000, category: 'accessories', trackingMode: 'quantity', attrs: {} },
    });
    await inventory.receiveQuantity({ idempotencyKey: `s3-recv-reject-${seq}`, productId: product.id, location: 'BISHKEK-1', quantity: 5 }, 'warehouse');
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `s3-own-reject-${seq}`);
    const sup = await supplier();

    await expect(supply.placeSupplierOrder(order.items[0].id, { supplierId: sup.id, unitCost: 1 }, 'staff'))
      .rejects.toMatchObject({ code: 'order_line_supply_not_found' });
  });

  it('placing the PO twice concurrently on the same line yields exactly one PurchaseOrderItem (advisory lock + idempotency)', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    const sup = await supplier();
    const dto = { supplierId: sup.id, unitCost: 45_000 };
    await prisma.orderLineSupply.update({
      where: { orderItemId: order.items[0].id },
      data: { status: 'awaiting_supplier' },
    });

    const results = await Promise.all([
      supply.placeSupplierOrder(order.items[0].id, dto, 'staff-a'),
      supply.placeSupplierOrder(order.items[0].id, dto, 'staff-b'),
    ]);

    expect(await prisma.purchaseOrderItem.count()).toBe(1);
    expect(await prisma.purchaseOrder.count()).toBe(1);
    const purchaseOrderItemIds = new Set(results.map((r) => r.purchaseOrderItemId));
    expect(purchaseOrderItemIds.size).toBe(1);
    expect(results.some((r) => r.idempotent === true)).toBe(true);
  });

  it('rejects an illegal transition (received before ordered/in_transit)', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);

    await expect(supply.markReceived(order.items[0].id, 'staff'))
      .rejects.toMatchObject({ code: 'illegal_supply_transition' });
  });

  it('requires quality check and ready before handover', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    const sup = await supplier();
    await placeLegacySupplierOrder(
      order.items[0].id,
      { supplierId: sup.id, unitCost: 45_000 },
      'staff',
    );
    await supply.markInTransit(order.items[0].id, 'staff');
    await markLegacyReceived(order.items[0].id, 'staff');

    await expect(supply.markHandedOver(order.items[0].id, 'staff'))
      .rejects.toMatchObject({ code: 'illegal_supply_transition' });

    await supply.markQualityChecked(order.items[0].id, 'staff');
    await supply.markReady(order.items[0].id, 'staff');
    await expect(supply.markHandedOver(order.items[0].id, 'staff'))
      .rejects.toMatchObject({ code: 'order_line_deposit_unpaid' });
  });

  it('cancels from a mid-state (ordered)', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    const sup = await supplier();
    await placeLegacySupplierOrder(order.items[0].id, { supplierId: sup.id, unitCost: 45_000 }, 'staff');

    const cancelled = await supply.cancel(order.items[0].id, { reason: 'поставщик сорвал сроки' }, 'staff');

    expect(cancelled.status).toBe('cancelled');
    expect(await prisma.auditEvent.findFirst({ where: { type: 'order_line_supply.cancelled', refs: { has: order.id } } })).not.toBeNull();
  });

  it('cancels from in_transit', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    const sup = await supplier();
    await placeLegacySupplierOrder(order.items[0].id, { supplierId: sup.id, unitCost: 45_000 }, 'staff');
    await supply.markInTransit(order.items[0].id, 'staff');

    const cancelled = await supply.cancel(order.items[0].id, {}, 'staff');
    expect(cancelled.status).toBe('cancelled');
  });

  it('a to_order line still cannot be sold while awaiting_supplier, ordered, or in_transit', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    await orders.transition(order.id, 'confirmed', 'staff');

    await expect(orders.reserve(order.id, 'staff')).rejects.toMatchObject({ code: 'to_order_not_reservable' });

    const sup = await supplier();
    await placeLegacySupplierOrder(order.items[0].id, { supplierId: sup.id, unitCost: 45_000 }, 'staff');
    await expect(orders.reserve(order.id, 'staff')).rejects.toMatchObject({ code: 'to_order_not_reservable' });

    await supply.markInTransit(order.items[0].id, 'staff');
    await expect(orders.reserve(order.id, 'staff')).rejects.toMatchObject({ code: 'to_order_not_reservable' });
  });

  it('a received supply line still cannot be imported into free quantity stock', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await toOrderOrder(product, buyer.id);
    const sup = await supplier();
    await placeLegacySupplierOrder(order.items[0].id, { supplierId: sup.id, unitCost: 45_000 }, 'staff');
    await supply.markInTransit(order.items[0].id, 'staff');
    await markLegacyReceived(order.items[0].id, 'staff');

    await expect(inventory.receiveQuantity({
      idempotencyKey: `s3-real-stock-${seq}`,
      productId: product.id,
      location: 'BISHKEK-1',
      quantity: 1,
    }, 'warehouse')).rejects.toMatchObject({ code: 'to_order_free_stock_forbidden' });
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } })).toBeNull();
  });

  it('courier COD guard: a to_order line whose supply is not yet received cannot complete a COD delivery', async () => {
    seq += 1;
    const product = await toOrderProduct({ sku: `S3-COD-${seq}` });
    const buyer = await customer();
    const staff = await prisma.staffUser.create({
      data: {
        username: `s3-courier-${runId}-${seq}`,
        passwordHash: 'test-only',
        role: 'courier',
        point: 'BISHKEK-1',
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'web',
        fulfillmentType: 'courier',
        deliveryAddress: 'Bishkek, test',
        paymentMode: 'cod',
        total: product.price,
        status: 'packed',
        courierId: staff.id,
        courierRunId: null,
        items: { create: { lineNumber: 1, sku: product.sku, qty: 1, price: product.price } },
      },
      include: { items: true },
    });
    // The supply record exists but was never received — this is the state the
    // guard exists to catch once an order can reach the courier flow at all.
    await prisma.orderLineSupply.create({
      data: { orderItemId: order.items[0].id, status: 'awaiting_supplier', actor: 'staff' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'out_for_delivery', courierId: staff.id } });

    await expect(courier.completeDelivery(order.id, { codAmount: product.price }, staff.id, `s3-cod-${seq}`))
      .rejects.toMatchObject({ code: 'order_reservation_incomplete' });
  });
});
