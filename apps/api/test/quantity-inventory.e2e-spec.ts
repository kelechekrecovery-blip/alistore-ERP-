import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ProductsService } from '../src/products/products.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { CustomersService } from '../src/customers/customers.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { PosService } from '../src/pos/pos.service';

describe('Quantity inventory (integration)', () => {
  let prisma: PrismaService;
  let inventory: InventoryService;
  let products: ProductsService;
  let catalog: CatalogService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let pos: PosService;
  let shifts: ShiftsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    inventory = new InventoryService(prisma, audit, approvals);
    products = new ProductsService(prisma, audit, approvals);
    catalog = new CatalogService(prisma, new ConfigService());
    const units = new UnitsService(prisma);
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
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(() => clean());

  async function clean() {
    await prisma.auditEvent.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.productBundleComponent.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.customer.deleteMany();
  }

  async function quantityProduct() {
    seq += 1;
    return products.create({
      sku: `CASE-QTY-${seq}`,
      name: 'Silicone case',
      price: 2500,
      cost: 1200,
      category: 'accessories',
      trackingMode: 'quantity',
      attrs: { color: 'black' },
    }, 'owner-quantity-test');
  }

  it('receives quantity stock atomically and exposes available stock to the catalog', async () => {
    const product = await quantityProduct();

    const first = await inventory.receiveQuantity({ idempotencyKey: `recv-3-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 25,
      reason: 'PO-1001',
    }, 'warehouse-quantity-test');
    const second = await inventory.receiveQuantity({ idempotencyKey: `recv-4-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 5,
    }, 'warehouse-quantity-test');

    expect(first).toMatchObject({ onHand: 25, reserved: 0, available: 25 });
    expect(second).toMatchObject({ onHand: 30, reserved: 0, available: 30 });
    expect(await prisma.inventoryBalance.count({ where: { productId: product.id } })).toBe(1);
    expect(await prisma.inventoryMovement.aggregate({
      where: { productId: product.id, type: 'received' },
      _sum: { qty: true },
    })).toMatchObject({ _sum: { qty: 30 } });

    const result = await catalog.search({ q: product.sku, stockOnly: true, limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: product.id,
      trackingMode: 'quantity',
      availableUnits: 30,
    });
    expect(await prisma.auditEvent.count({
      where: { type: 'stock.received', actor: 'warehouse-quantity-test' },
    })).toBe(2);
  });

  it('keeps serialized and quantity receiving paths separate', async () => {
    const quantity = await quantityProduct();
    const serialized = await products.create({
      sku: `PHONE-SERIAL-${++seq}`,
      name: 'Serialized phone',
      price: 100000,
      cost: 80000,
      category: 'phones',
      attrs: {},
    }, 'owner-quantity-test');

    await expect(inventory.receive({
      productId: quantity.id,
      location: 'BISHKEK-1',
      imeis: ['QTY-MUST-NOT-GET-IMEI'],
    }, 'warehouse-quantity-test')).rejects.toMatchObject({ code: 'serialized_product_required' });
    await expect(inventory.receiveQuantity({ idempotencyKey: `recv-5-${Math.random().toString(36).slice(2)}`, productId: serialized.id,
      location: 'BISHKEK-1',
      quantity: 1,
    }, 'warehouse-quantity-test')).rejects.toMatchObject({ code: 'quantity_product_required' });
  });

  it('moves only available quantity stock once and rejects key reuse', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-6-${Math.random().toString(36).slice(2)}`, productId: product.id, location: 'BISHKEK-1', quantity: 8 }, 'warehouse');
    await prisma.inventoryBalance.update({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
      data: { reserved: 3 },
    });
    const command = {
      idempotencyKey: `quantity-transfer-${seq}`,
      productId: product.id,
      from: 'BISHKEK-1',
      to: 'BISHKEK-2',
      qty: 5,
    };

    const first = await inventory.transferQuantity(command, 'warehouse');
    const replay = await inventory.transferQuantity(command, 'warehouse');
    expect(first).toMatchObject({ qty: 5, idempotent: false });
    expect(replay).toMatchObject({ movementId: first.movementId, totalValue: 6000, idempotent: true });
    expect(await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 3, reserved: 3 });
    expect(await prisma.inventoryBalance.findUnique({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-2' } },
    })).toMatchObject({ onHand: 5, reserved: 0 });
    expect(await prisma.inventoryMovement.count({ where: { idempotencyKey: command.idempotencyKey } })).toBe(1);

    await expect(inventory.transferQuantity({ ...command, qty: 4 }, 'warehouse'))
      .rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(inventory.transferQuantity({ ...command, idempotencyKey: `${command.idempotencyKey}-new`, qty: 1 }, 'warehouse'))
      .rejects.toMatchObject({ code: 'insufficient_available_stock' });
  });

  it('moves FIFO valuation with quantity stock without changing total inventory value', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-7-${Math.random().toString(36).slice(2)}`, productId: product.id, location: 'BISHKEK-1', quantity: 3, unitCost: 1000,
    }, 'warehouse');
    await inventory.receiveQuantity({ idempotencyKey: `recv-8-${Math.random().toString(36).slice(2)}`, productId: product.id, location: 'BISHKEK-1', quantity: 4, unitCost: 1500,
    }, 'warehouse');

    const moved = await inventory.transferQuantity({
      idempotencyKey: `quantity-value-transfer-${seq}`,
      productId: product.id,
      from: 'BISHKEK-1',
      to: 'BISHKEK-2',
      qty: 5,
    }, 'warehouse');

    expect(moved).toMatchObject({ qty: 5, consignmentQty: 0, totalValue: 6000 });
    const balances = await prisma.inventoryBalance.findMany({
      where: { productId: product.id },
      orderBy: { location: 'asc' },
    });
    expect(balances).toMatchObject([
      { location: 'BISHKEK-1', onHand: 2, inventoryValue: 3000 },
      { location: 'BISHKEK-2', onHand: 5, inventoryValue: 6000 },
    ]);
    expect(balances.reduce((sum, balance) => sum + balance.inventoryValue, 0)).toBe(9000);
    expect(await prisma.inventoryValuationLayer.findMany({
      where: { balanceId: balances[1].id, quantityRemaining: { gt: 0 } },
      orderBy: [{ unitCost: 'asc' }, { id: 'asc' }],
      select: { unitCost: true, quantityReceived: true, quantityRemaining: true, sourceType: true },
    })).toEqual([
      { unitCost: 1000, quantityReceived: 3, quantityRemaining: 3, sourceType: 'inventory.transfer' },
      { unitCost: 1500, quantityReceived: 2, quantityRemaining: 2, sourceType: 'inventory.transfer' },
    ]);
    expect(await prisma.inventoryMovement.findUnique({ where: { id: moved.movementId } }))
      .toMatchObject({ totalValue: 6000, unitCost: null });
  });

  it('serializes competing quantity transfers from the same balance', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-9-${Math.random().toString(36).slice(2)}`, productId: product.id, location: 'BISHKEK-1', quantity: 5, unitCost: 1100,
    }, 'warehouse');

    const results = await Promise.allSettled(['BISHKEK-2', 'BISHKEK-3'].map((to, index) => inventory.transferQuantity({
      idempotencyKey: `quantity-racing-transfer-${seq}-${index}`,
      productId: product.id,
      from: 'BISHKEK-1',
      to,
      qty: 4,
    }, 'warehouse')));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.inventoryBalance.aggregate({
      where: { productId: product.id },
      _sum: { onHand: true, inventoryValue: true },
    })).toMatchObject({ _sum: { onHand: 5, inventoryValue: 5500 } });
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, type: 'moved' },
    })).toBe(1);
  });

  it('prevents tracking-mode changes once stock exists', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-10-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 1,
    }, 'warehouse-quantity-test');

    await expect(products.update(product.id, {
      trackingMode: 'serialized',
    }, 'owner-quantity-test')).rejects.toMatchObject({ code: 'tracking_mode_in_use' });
  });

  it('reserves, sells, and deduplicates quantity stock through the web order flow', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-11-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 3,
    }, 'warehouse-quantity-test');
    const customer = await prisma.customer.create({
      data: { phone: `+99670091${seq.toString().padStart(4, '0')}`, name: 'Quantity buyer' },
    });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: 1,
      items: [{ sku: product.sku, qty: 2, price: 1 }],
    }, customer.id, `quantity-order-${seq}`);

    await orders.fulfill(order.id, 'warehouse-quantity-test');
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 3, reserved: 2 });

    const first = await payments.pay({
      orderId: order.id,
      amount: product.price * 2,
      method: 'card',
      txnId: `quantity-payment-${seq}`,
    }, 'cashier-quantity-test');
    const replay = await payments.pay({
      orderId: order.id,
      amount: product.price * 2,
      method: 'card',
      txnId: `quantity-payment-${seq}`,
    }, 'cashier-quantity-test');

    expect(first.order?.status).toBe('paid');
    expect(replay.idempotent).toBe(true);
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 1, reserved: 0 });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'stock.sold', refs: { has: order.id } } })).toBe(1);
  });

  it('allows only one concurrent order to reserve the final quantity', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-12-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 1,
    }, 'warehouse-quantity-test');
    const customers = await Promise.all([1, 2].map((index) => prisma.customer.create({
      data: { phone: `+99670092${seq}${index}`, name: `Quantity ${index}` },
    })));
    const pending = await Promise.all(customers.map((customer, index) => orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, customer.id, `quantity-race-${seq}-${index}`)));

    const results = await Promise.allSettled(pending.map((order) => orders.fulfill(order.id, 'warehouse-race')));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.orderQuantityAllocation.count({ where: { active: true } })).toBe(1);
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 1, reserved: 1 });
  });

  it('releases quantity stock on cancellation and rejects unstocked serialized POS lines', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-13-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 2,
    }, 'warehouse-quantity-test');
    const customer = await prisma.customer.create({
      data: { phone: `+99670093${seq.toString().padStart(4, '0')}`, name: 'Cancel buyer' },
    });
    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, customer.id);
    await orders.fulfill(order.id, 'warehouse-quantity-test');
    await orders.transition(order.id, 'cancelled', 'warehouse-quantity-test');
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 2, reserved: 0 });

    const serialized = await products.create({
      sku: `EMPTY-SERIAL-${++seq}`,
      name: 'Empty serialized phone',
      price: 50000,
      cost: 40000,
      category: 'phones',
      attrs: {},
    }, 'owner-quantity-test');
    await expect(pos.sale({
      staffId: 'cashier-quantity-test',
      point: 'BISHKEK-1',
      method: 'cash',
      lines: [{ productId: serialized.id, sku: serialized.sku, price: serialized.price, qty: 1 }],
    })).rejects.toMatchObject({ code: 'insufficient_stock' });
  });

  it('sells quantity stock through POS exactly once', async () => {
    const product = await quantityProduct();
    await inventory.receiveQuantity({ idempotencyKey: `recv-14-${Math.random().toString(36).slice(2)}`, productId: product.id,
      location: 'BISHKEK-1',
      quantity: 4,
    }, 'warehouse-quantity-test');
    const payload = {
      staffId: 'cashier-quantity-pos',
      point: 'BISHKEK-1',
      method: 'cash' as const,
      clientSaleId: `quantity-pos-${seq}`,
      lines: [{ productId: product.id, sku: product.sku, price: product.price, qty: 3 }],
    };
    await openShift('cashier-quantity-pos');

    const first = await pos.sale(payload);
    const replay = await pos.sale(payload);
    if (first.pendingApproval || replay.pendingApproval) throw new Error('quantity sale unexpectedly parked');

    expect(replay.orderId).toBe(first.orderId);
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 1, reserved: 0 });
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });
});
