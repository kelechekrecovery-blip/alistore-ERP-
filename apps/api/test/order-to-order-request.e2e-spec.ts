import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { ProcurementService } from '../src/procurement/procurement.service';
import { OrderLineSupplyService } from '../src/procurement/order-line-supply.service';
import { OrderCancellationsService } from '../src/orders/order-cancellations.service';
import { RefundProcessor } from '../src/refunds/refunds.processor';
import type { PaymentGatewayProvider } from '../src/payments/payment-gateway-provider';
import { OrderCancellationResolutionService } from '../src/orders/order-cancellation-resolution.service';
import { StaffAuthService } from '../src/staff-auth/staff-auth.service';
import { JwtService } from '@nestjs/jwt';
import { TotpService } from '../src/auth/totp.service';
import { authenticator } from 'otplib';
import { ReturnsService } from '../src/returns/returns.service';

/**
 * Slice 2 of docs/SUPPLY-TO-ORDER-PLAN.md — a `to_order` product becomes
 * orderable as a request: zero money movement, zero stock movement, no
 * reservation. See the invariant section of the plan: `to_order` must never
 * reach `finalizeOrderInventorySaleOnTx` / `reserveQuantityOnTx`.
 */
describe('Order supply mode: to_order request (slice 2)', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let inventory: InventoryService;
  let procurement: ProcurementService;
  let lineSupply: OrderLineSupplyService;
  let cancellations: OrderCancellationsService;
  let cancellationResolutions: OrderCancellationResolutionService;
  let refundProcessor: RefundProcessor;
  let returns: ReturnsService;
  let seq = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    const approvals = new ApprovalsService(prisma, audit);
    orders = new OrdersService(
      prisma,
      audit,
      units,
      undefined,
      new ConfigService({ TO_ORDER_CHECKOUT_ENABLED: 'true' }),
    );
    payments = new PaymentsService(prisma, audit, units, approvals);
    inventory = new InventoryService(prisma, audit, approvals);
    procurement = new ProcurementService(prisma, audit);
    lineSupply = new OrderLineSupplyService(
      prisma,
      audit,
      units,
      new ConfigService({ SUPPLY_PARTIAL_HANDOVER_ENABLED: 'true' }),
    );
    returns = new ReturnsService(prisma, audit);
    cancellations = new OrderCancellationsService(
      prisma,
      audit,
      new ConfigService({
        SUPPLY_CANCELLATION_ENABLED: 'true',
        SUPPLY_AUTO_REFUND_ENABLED: 'true',
      }),
    );
    const staffAuth = new StaffAuthService(
      prisma,
      new JwtService({ secret: 'supply-cancellation-resolution-test' }),
      new TotpService(),
      audit,
    );
    cancellationResolutions = new OrderCancellationResolutionService(
      prisma,
      audit,
      staffAuth,
      new ConfigService({
        SUPPLY_CANCELLATION_ENABLED: 'true',
        SUPPLY_OWNER_RESOLUTION_ENABLED: 'true',
      }),
    );
    const gateway = {
      name: 'production',
      assertOperational: () => undefined,
      createIntent: async () => { throw new Error('unused'); },
      verifyWebhook: async () => { throw new Error('unused'); },
      verifyRefundWebhook: async () => { throw new Error('unused'); },
      refund: async (input) => ({
        providerRefundId: `provider-${input.idempotencyKey}`,
        status: 'succeeded' as const,
      }),
    } satisfies PaymentGatewayProvider;
    refundProcessor = new RefundProcessor(prisma, audit, gateway);
  });

  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  beforeEach(() => clean());

  async function clean() {
    // Создание заказа кладёт уведомление покупателю в исходящую очередь.
    // Не убрать её за собой — значит подложить строку следующему сьюту:
    // outbox.e2e-spec идёт сразу за этим файлом по алфавитному секвенсеру и
    // читает очередь через findFirst() без фильтра, то есть подхватывает
    // чужое сообщение и падает на чужом статусе.
    await prisma.outboxMessage.deleteMany();
    await prisma.staffTask.deleteMany({ where: { relatedType: 'order_no_show' } });
    await prisma.auditEvent.deleteMany();
    await prisma.evidenceUpload.deleteMany({
      where: { actor: { startsWith: `supply-resolution-${runId}` } },
    });
    await prisma.reservation.deleteMany();
    await prisma.orderQuantityAllocation.deleteMany();
    await prisma.paymentReceivableAllocation.deleteMany();
    await prisma.orderReceivable.deleteMany();
    await prisma.orderCancellation.deleteMany();
    await prisma.refundAllocation.deleteMany();
    await prisma.refundLine.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.supplyQuantityAllocation.deleteMany();
    // Quantity allocations can retain the issue they consumed, while return
    // reconciliation can retain a reversal of that issue. Remove the allocation
    // first, then the covered reversal+issue pair in one deferred-check
    // transaction.
    await prisma.$transaction(async (tx) => {
      await tx.inventoryValuationReversal.deleteMany();
      await tx.inventoryValuationIssue.deleteMany();
    });
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    // Слайс 3 плана: заказ «под заказ» заводит OrderLineSupply на каждую строку
    // (orders.service.ts, hasToOrderLine) — FK на OrderItem это Restrict.
    await prisma.orderLineSupply.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventoryValuationLayer.deleteMany();
    await prisma.inventoryBalance.deleteMany();
    await prisma.deviceUnit.deleteMany();
    await prisma.supplierOffer.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: `supply-owner-${runId}` } } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: `supply-resolution-${runId}` } } });
  }

  async function customer() {
    seq += 1;
    return prisma.customer.create({
      data: { phone: `+99670080${seq.toString().padStart(4, '0')}`, name: 'Supply buyer' },
    });
  }

  async function toOrderProduct(overrides: Record<string, unknown> = {}) {
    seq += 1;
    const supplier = await prisma.supplier.create({
      data: { name: `Supply request supplier ${seq}` },
    });
    return prisma.product.create({
      data: {
        sku: `TO-ORDER-${seq}`,
        name: 'Куплю у поставщика',
        price: 50_000,
        cost: 40_000,
        category: 'phones',
        trackingMode: 'quantity',
        supplyMode: 'to_order',
        supplyLeadDays: 14,
        attrs: {},
        supplierId: supplier.id,
        supplierOffers: {
          create: {
            supplierId: supplier.id,
            unitCost: 40_000,
            availableQty: 10,
            leadDays: 14,
            checkedAt: new Date(),
            validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
            updatedBy: 'test',
          },
        },
        ...overrides,
      },
    });
  }

  async function postPoCancellation() {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `owner-resolution-order-${runId}-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `owner-resolution-${runId}-${seq}` },
      'staff:test-cashier',
      {
        staffId: 'test-cashier',
        idempotencyKey: `owner-resolution-payment-${runId}-${seq}`,
      },
    );
    const supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: true },
    });
    await procurement.send(
      supply.purchaseOrderItem!.purchaseOrderId,
      'staff:test-procurement',
    );
    const cancellation = await cancellations.request(
      order.id,
      buyer.id,
      'Покупатель просит отменить заказ после отправки PO',
      `owner-resolution-request-${runId}-${seq}`,
    );
    return { buyer, order, deposit, cancellation };
  }

  async function resolutionStaff(role: 'owner' | 'admin' | 'seller' = 'owner') {
    const secret = authenticator.generateSecret();
    const staff = await prisma.staffUser.create({
      data: {
        username: `supply-resolution-${runId}-${role}-${++seq}`,
        passwordHash: 'test-only-not-a-real-credential',
        role,
        point: 'BISHKEK-1',
        totpEnabled: true,
        totpSecret: secret,
      },
    });
    return { staff, token: () => authenticator.generate(secret) };
  }

  async function ownStockProduct(overrides: Partial<Parameters<typeof prisma.product.create>[0]['data']> = {}) {
    seq += 1;
    return prisma.product.create({
      data: {
        sku: `OWN-STOCK-${seq}`,
        name: 'Свой сток',
        price: 30_000,
        cost: 20_000,
        category: 'accessories',
        trackingMode: 'quantity',
        attrs: {},
        ...overrides,
      },
    });
  }

  it('orders a to_order product with zero stock: awaiting_confirmation, order.created, no reservation footprint', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();

    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `to-order-${seq}`);

    expect(order.status).toBe('awaiting_payment');
    expect(order.initialDue).toBe(10_000);
    expect(order.balanceDue).toBe(40_000);

    const event = await prisma.auditEvent.findFirst({ where: { type: 'order.created', refs: { has: order.id } } });
    expect(event).not.toBeNull();

    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.orderQuantityAllocation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.inventoryBalance.findMany({ where: { productId: product.id } })).toEqual([]);
  });

  it('fails closed when the to-order checkout feature flag is absent', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const disabledOrders = new OrdersService(
      prisma,
      new AuditService(prisma),
      new UnitsService(prisma),
    );

    await expect(disabledOrders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `to-order-disabled-${seq}`)).rejects.toMatchObject({
      code: 'to_order_checkout_disabled',
    });
  });

  it('still rejects an own-stock product with zero stock — the gate was not weakened for everyone', async () => {
    const product = await ownStockProduct();
    const buyer = await customer();

    await expect(orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `own-stock-${seq}`)).rejects.toMatchObject({ code: 'insufficient_stock' });
  });

  it('creates line-level schedules for a cart mixing to-order and own stock', async () => {
    const toOrder = await toOrderProduct();
    const ownStock = await ownStockProduct();
    await prisma.inventoryBalance.create({
      data: { productId: ownStock.id, location: 'BISHKEK-1', onHand: 5, reserved: 0 },
    });
    const buyer = await customer();

    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: toOrder.price + ownStock.price,
      items: [
        { sku: toOrder.sku, qty: 1, price: toOrder.price },
        { sku: ownStock.sku, qty: 1, price: ownStock.price },
      ],
    }, buyer.id, `mixed-${seq}`);

    expect(order.status).toBe('awaiting_payment');
    expect(order.initialDue).toBe(10_000);
    expect(order.paymentSchedule).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'supply_deposit', amount: 10_000 }),
      expect.objectContaining({ kind: 'supply_balance', amount: 40_000 }),
      expect.objectContaining({ kind: 'stock_sale', amount: 30_000 }),
    ]));
    expect(await prisma.orderLineSupply.count({
      where: { orderItem: { orderId: order.id } },
    })).toBe(1);
  });

  it('posts the deposit to liability, claims the quote, and creates one draft PO per supplier', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `deposit-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });

    const result = await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `deposit-txn-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `deposit-pay-${runId}-${seq}` },
    );

    expect(result.idempotent).toBe(false);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: 'confirmed',
    });
    expect(await prisma.orderReceivable.findUniqueOrThrow({ where: { id: deposit.id } })).toMatchObject({
      status: 'settled',
      settledAmount: deposit.amount,
    });
    const supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: { include: { purchaseOrder: true } } },
    });
    expect(supply.status).toBe('procurement_draft');
    expect(supply.purchaseOrderItem?.purchaseOrder).toMatchObject({
      status: 'draft',
      sourceOrderId: order.id,
      supplierId: product.supplierId,
    });
    expect(await prisma.supplierOffer.findFirstOrThrow({ where: { productId: product.id, active: true } }))
      .toMatchObject({ availableQty: 9 });
    const posted = await prisma.payment.findUniqueOrThrow({
      where: { id: result.payment.id },
      include: { accountingEntry: { include: { lines: true } } },
    });
    expect(posted.accountingEntry?.sourceType).toBe('customer_prepayment.receipt');
    expect(posted.accountingEntry?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1020', debit: deposit.amount, credit: 0 }),
      expect.objectContaining({ accountCode: '2400', debit: 0, credit: deposit.amount }),
    ]));
    expect(await prisma.inventoryBalance.count({ where: { productId: product.id } })).toBe(0);
    const publicOrder = await orders.getForCustomer(order.id, buyer.id);
    expect(publicOrder?.items[0]).not.toHaveProperty('unitCost');
    expect(publicOrder?.items[0]).not.toHaveProperty('supplierIdSnapshot');
    expect(publicOrder?.items[0]).not.toHaveProperty('inventorySnapshot');
    expect(publicOrder?.items[0].orderLineSupply).not.toHaveProperty('supplierOfferId');
    expect(publicOrder?.items[0].orderLineSupply).not.toHaveProperty('actor');

    await procurement.send(supply.purchaseOrderItem!.purchaseOrderId, 'staff:test-procurement');
    expect(await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } }))
      .toMatchObject({ status: 'ordered' });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'supplier_ordered' });
  });

  it('deduplicates concurrent deposit callbacks and never creates a second payment or PO', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `deposit-race-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    const idempotencyKey = `deposit-race-${runId}-${seq}`;
    const settle = () => payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `deposit-race-txn-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey },
    );

    const results = await Promise.all([settle(), settle()]);

    expect(results.map((result) => result.idempotent).sort()).toEqual([false, true]);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.paymentReceivableAllocation.count({ where: { receivableId: deposit.id } })).toBe(1);
    expect(await prisma.purchaseOrder.count({ where: { sourceOrderId: order.id } })).toBe(1);
    expect(await prisma.supplierOffer.findFirstOrThrow({ where: { productId: product.id, active: true } }))
      .toMatchObject({ availableQty: 9 });
  });

  it('previews a full automatic deposit refund before PO send and owner resolution after send', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const stranger = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `cancellation-preview-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });

    expect(await cancellations.preview(order.id, buyer.id)).toMatchObject({
      canCancel: true,
      policy: 'automatic_full',
      depositPaid: 0,
      estimatedRefundAmount: 0,
      ownerReviewRequired: false,
    });
    expect(await cancellations.preview(order.id, stranger.id)).toBeNull();

    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `cancel-preview-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `cancel-preview-pay-${runId}-${seq}` },
    );
    const supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: true },
    });
    expect(await cancellations.preview(order.id, buyer.id)).toMatchObject({
      policy: 'automatic_full',
      depositPaid: deposit.amount,
      estimatedRefundAmount: deposit.amount,
      ownerReviewRequired: false,
    });

    await procurement.send(supply.purchaseOrderItem!.purchaseOrderId, 'staff:test-procurement');
    expect(await cancellations.preview(order.id, buyer.id)).toMatchObject({
      policy: 'owner_resolution',
      depositPaid: deposit.amount,
      estimatedRefundAmount: deposit.amount,
      supplierExpenseDeduction: 0,
      ownerReviewRequired: true,
    });
  });

  it('keeps cancellation and automatic refund fail-closed behind separate flags', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `cancellation-flags-order-${seq}`);
    const cancellationDisabled = new OrderCancellationsService(
      prisma,
      new AuditService(prisma),
      new ConfigService({
        SUPPLY_CANCELLATION_ENABLED: 'false',
        SUPPLY_AUTO_REFUND_ENABLED: 'false',
      }),
    );
    expect(await cancellationDisabled.preview(order.id, buyer.id)).toMatchObject({
      canCancel: true,
      requestEnabled: false,
      automaticRefundEnabled: false,
    });
    await expect(cancellationDisabled.request(
      order.id,
      buyer.id,
      'Отмена при выключенном контуре',
      `cancellation-disabled-${runId}-${seq}`,
    )).rejects.toMatchObject({ code: 'supply_cancellation_disabled' });

    const automaticRefundDisabled = new OrderCancellationsService(
      prisma,
      new AuditService(prisma),
      new ConfigService({
        SUPPLY_CANCELLATION_ENABLED: 'true',
        SUPPLY_AUTO_REFUND_ENABLED: 'false',
      }),
    );
    await expect(automaticRefundDisabled.request(
      order.id,
      buyer.id,
      'Автовозврат ещё не сертифицирован',
      `auto-refund-disabled-${runId}-${seq}`,
    )).rejects.toMatchObject({ code: 'supply_auto_refund_disabled' });
    expect(await prisma.orderCancellation.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .toMatchObject({ status: 'awaiting_payment' });
  });

  it('creates one immutable cancellation request under replay and concurrency', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `cancellation-request-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `cancel-request-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `cancel-request-pay-${runId}-${seq}` },
    );
    const key = `cancel-request-${runId}-${seq}`;
    const create = () => cancellations.request(order.id, buyer.id, 'Передумал покупать товар', key);

    const [first, replay] = await Promise.all([create(), create()]);

    expect(first.id).toBe(replay.id);
    expect(first).toMatchObject({
      orderId: order.id,
      status: 'refund_queued',
      policySnapshot: 'automatic_full',
      purchaseOrderSentSnapshot: false,
      depositPaidSnapshot: deposit.amount,
      requestedRefundAmount: deposit.amount,
      customerReason: 'Передумал покупать товар',
    });
    expect(first.refundId).toBeTruthy();
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: first.refundId! } }))
      .toMatchObject({
        purpose: 'customer_prepayment',
        status: 'approved',
        amount: deposit.amount,
        returnId: null,
      });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .toMatchObject({ status: 'cancelled' });
    expect(await prisma.purchaseOrder.findFirstOrThrow({ where: { sourceOrderId: order.id } }))
      .toMatchObject({ status: 'cancelled', sentAt: null });
    expect(await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } }))
      .toMatchObject({ status: 'customer_cancelled' });
    expect(await prisma.orderReceivable.count({
      where: { orderId: order.id, status: { not: 'cancelled' } },
    })).toBe(0);
    expect(await prisma.orderCancellation.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { type: 'order.cancellation_requested', refs: { has: order.id } },
    })).toBe(1);
    await expect(cancellations.request(order.id, buyer.id, 'Другая причина отмены', key))
      .rejects.toMatchObject({ code: 'idempotency_key_reused' });
    await expect(cancellations.request(
      order.id,
      buyer.id,
      'Ещё одна параллельная отмена',
      `${key}-other`,
    )).rejects.toMatchObject({ code: 'order_cancellation_active' });
  });

  it('executes a pre-PO deposit refund against liability 2400 without reversing revenue or tax', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `cancellation-refund-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `cancel-refund-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `cancel-refund-pay-${runId}-${seq}` },
    );
    const cancellation = await cancellations.request(
      order.id,
      buyer.id,
      'Полный возврат до отправки PO',
      `cancel-refund-request-${runId}-${seq}`,
    );

    await refundProcessor.processRefund(cancellation.refundId!);

    expect(await prisma.orderCancellation.findUniqueOrThrow({ where: { id: cancellation.id } }))
      .toMatchObject({ status: 'refunded', completedAt: expect.any(Date) });
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: cancellation.refundId! } }))
      .toMatchObject({ purpose: 'customer_prepayment', status: 'succeeded' });
    const refundPayment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id, amount: -deposit.amount },
      include: { accountingEntry: { include: { lines: true } } },
    });
    expect(refundPayment.accountingEntry).toMatchObject({
      sourceType: 'customer_prepayment.refund',
      taxAmount: 0,
    });
    expect(refundPayment.accountingEntry?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '2400', debit: deposit.amount, credit: 0 }),
      expect.objectContaining({ accountCode: '1020', debit: 0, credit: deposit.amount }),
    ]));
    expect(refundPayment.accountingEntry?.lines.some((line) => ['4000', '2200'].includes(line.accountCode)))
      .toBe(false);
  });

  it('snapshots owner resolution policy when PO was sent before cancellation', async () => {
    const product = await toOrderProduct();
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `owner-cancellation-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `owner-cancel-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `owner-cancel-pay-${runId}-${seq}` },
    );
    const supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: true },
    });
    await procurement.send(supply.purchaseOrderItem!.purchaseOrderId, 'staff:test-procurement');

    const cancellation = await cancellations.request(
      order.id,
      buyer.id,
      'Отмена после отправки поставщику',
      `owner-cancel-request-${runId}-${seq}`,
    );

    expect(cancellation).toMatchObject({
      status: 'awaiting_owner',
      policySnapshot: 'owner_resolution',
      purchaseOrderSentSnapshot: true,
      depositPaidSnapshot: deposit.amount,
      requestedRefundAmount: deposit.amount,
    });
  });

  it('allows only owner/admin and forces a full refund for supplier or AliStore fault', async () => {
    const { order, deposit, cancellation } = await postPoCancellation();
    const seller = await resolutionStaff('seller');
    await expect(cancellationResolutions.preview(
      order.id,
      cancellation.id,
      seller.staff.role,
    )).rejects.toMatchObject({ code: 'cancellation_owner_role_required' });

    const owner = await resolutionStaff('owner');
    expect(await cancellationResolutions.preview(
      order.id,
      cancellation.id,
      owner.staff.role,
    )).toMatchObject({ canResolve: true, fullRefundAmount: deposit.amount });
    await expect(cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      {
        action: 'approve_partial',
        refundAmount: deposit.amount - 1_000,
        supplierExpenseAmount: 1_000,
        faultParty: 'supplier',
        ownerReason: 'Поставщик подтвердил свою ошибку',
        evidenceIds: [],
      },
      `supplier-partial-forbidden-${runId}-${seq}`,
      owner.token(),
    )).rejects.toMatchObject({ code: 'full_refund_fault_required' });

    const key = `supplier-full-resolution-${runId}-${seq}`;
    const resolve = () => cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      {
        action: 'approve_full',
        refundAmount: deposit.amount,
        supplierExpenseAmount: 0,
        faultParty: 'supplier',
        ownerReason: 'Поставщик нарушил согласованный срок',
        evidenceIds: [],
      },
      key,
      owner.token(),
    );
    const [first, replay] = await Promise.all([resolve(), resolve()]);
    expect(first.id).toBe(replay.id);
    expect(first).toMatchObject({
      status: 'refund_queued',
      resolutionAction: 'approve_full',
      approvedRefundAmount: deposit.amount,
      supplierExpenseAmount: 0,
      faultParty: 'supplier',
      resolvedBy: owner.staff.id,
    });
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: first.refundId! } }))
      .toMatchObject({
        purpose: 'customer_prepayment',
        status: 'approved',
        amount: deposit.amount,
        approver: owner.staff.id,
      });
    expect(await prisma.refundAllocation.aggregate({
      where: { refundId: first.refundId! },
      _sum: { amount: true },
    })).toMatchObject({ _sum: { amount: deposit.amount } });
    expect(await prisma.auditEvent.count({
      where: { type: 'order.cancellation_owner_resolved', refs: { has: cancellation.id } },
    })).toBe(1);
  });

  it('requires order-bound Evidence and an exact expense formula for a partial customer-fault refund', async () => {
    const { order, deposit, cancellation } = await postPoCancellation();
    const owner = await resolutionStaff('admin');
    const expense = 2_000;
    const refundAmount = deposit.amount - expense;

    await expect(cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      {
        action: 'approve_partial',
        refundAmount,
        supplierExpenseAmount: expense,
        faultParty: 'customer',
        ownerReason: 'Поставщик документировал фактические расходы',
        evidenceIds: [],
      },
      `partial-no-evidence-${runId}-${seq}`,
      owner.token(),
    )).rejects.toMatchObject({ code: 'partial_refund_evidence_required' });

    const evidence = await prisma.evidenceUpload.create({
      data: {
        idempotencyKey: `resolution-evidence-${runId}-${seq}`,
        actor: `supply-resolution-${runId}`,
        entityType: 'order',
        entityId: order.id,
        label: 'supplier_expense',
        fingerprint: `resolution-evidence-fingerprint-${runId}-${seq}`,
        asset: { key: `private/order/${order.id}/expense.jpg` },
      },
    });
    await expect(cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      {
        action: 'approve_partial',
        refundAmount: refundAmount - 1,
        supplierExpenseAmount: expense,
        faultParty: 'customer',
        ownerReason: 'Проверка неверной арифметики',
        evidenceIds: [evidence.id],
      },
      `partial-bad-formula-${runId}-${seq}`,
      owner.token(),
    )).rejects.toMatchObject({ code: 'partial_refund_amount_invalid' });

    const resolved = await cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      {
        action: 'approve_partial',
        refundAmount,
        supplierExpenseAmount: expense,
        faultParty: 'customer',
        ownerReason: 'Поставщик документировал фактические расходы',
        evidenceIds: [evidence.id],
      },
      `partial-resolution-${runId}-${seq}`,
      owner.token(),
    );
    expect(resolved).toMatchObject({
      status: 'refund_queued',
      resolutionAction: 'approve_partial',
      approvedRefundAmount: refundAmount,
      supplierExpenseAmount: expense,
      evidence: [evidence.id],
    });
    expect(await prisma.refund.findUniqueOrThrow({ where: { id: resolved.refundId! } }))
      .toMatchObject({ purpose: 'customer_prepayment', amount: refundAmount });
    const customerProjection = await cancellations.current(order.id, order.customerId);
    expect(customerProjection).not.toHaveProperty('supplierExpenseAmount');
    expect(customerProjection).not.toHaveProperty('faultParty');
    expect(customerProjection).not.toHaveProperty('evidence');
  });

  it('idempotently rejects a cancellation without changing the order or creating a refund', async () => {
    const { order, cancellation } = await postPoCancellation();
    const owner = await resolutionStaff('owner');
    const key = `reject-resolution-${runId}-${seq}`;
    const input = {
      action: 'reject' as const,
      ownerReason: 'Поставщик уже исполняет заказ, отмена отклонена',
    };
    const first = await cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      input,
      key,
      owner.token(),
    );
    const replay = await cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      input,
      key,
      owner.token(),
    );
    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      status: 'rejected',
      resolutionAction: 'reject',
      refundId: null,
      completedAt: expect.any(Date),
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .not.toMatchObject({ status: 'cancelled' });
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('forbids any repeated owner resolution after the refund has executed', async () => {
    const { order, deposit, cancellation } = await postPoCancellation();
    const owner = await resolutionStaff('owner');
    const key = `completed-resolution-${runId}-${seq}`;
    const input = {
      action: 'approve_full' as const,
      refundAmount: deposit.amount,
      faultParty: 'alistore' as const,
      ownerReason: 'AliStore не выполнил обязательство',
    };
    const resolved = await cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      input,
      key,
      owner.token(),
    );
    await refundProcessor.processRefund(resolved.refundId!);
    expect(await prisma.orderCancellation.findUniqueOrThrow({
      where: { id: cancellation.id },
    })).toMatchObject({ status: 'refunded', completedAt: expect.any(Date) });
    await expect(cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      input,
      key,
      owner.token(),
    )).rejects.toMatchObject({ code: 'cancellation_already_completed' });
    await expect(cancellationResolutions.resolve(
      order.id,
      cancellation.id,
      owner.staff.id,
      owner.staff.role,
      input,
      `${key}-new`,
      owner.token(),
    )).rejects.toMatchObject({ code: 'cancellation_refund_already_created' });
  });

  it('receives an ordered IMEI directly as customer-reserved without creating free stock', async () => {
    const product = await toOrderProduct({ trackingMode: 'serialized' });
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `reserved-receipt-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `reserved-receipt-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `reserved-receipt-pay-${runId}-${seq}` },
    );
    let supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: true },
    });
    await procurement.send(supply.purchaseOrderItem!.purchaseOrderId, 'staff:test-procurement');
    await lineSupply.markInTransit(order.items[0].id, 'staff:test-procurement');
    supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: true },
    });
    const imei = `356000${seq.toString().padStart(9, '0')}`;

    await procurement.receive(
      supply.purchaseOrderItem!.purchaseOrderId,
      {
        idempotencyKey: `reserved-receipt-po-${runId}-${seq}`,
        lines: [{ itemId: supply.purchaseOrderItemId!, imeis: [imei] }],
      },
      'staff:test-warehouse',
    );

    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei } })).toMatchObject({
      status: 'reserved',
      orderId: order.id,
      productId: product.id,
    });
    expect(await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } }))
      .toMatchObject({ status: 'received', receivedQty: 1 });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'received' });
    expect(await prisma.inventoryBalance.count({ where: { productId: product.id } })).toBe(0);
    expect(await new UnitsService(prisma).listAvailable(product.id, 10)).toEqual([]);

    await lineSupply.markQualityChecked(order.items[0].id, 'staff:test-warehouse');
    await lineSupply.markReady(order.items[0].id, 'staff:test-warehouse');
    await expect(lineSupply.markHandedOver(order.items[0].id, 'staff:test-seller'))
      .rejects.toMatchObject({ code: 'order_line_receivables_unpaid' });
    const balance = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderItemId: order.items[0].id, kind: 'supply_balance' },
    });
    await payments.settleReceivable(
      balance.id,
      { method: 'card', amount: balance.amount, txnId: `reserved-balance-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `reserved-balance-pay-${runId}-${seq}` },
    );
    await lineSupply.markHandedOver(order.items[0].id, 'staff:test-seller');

    expect(await prisma.deviceUnit.findUniqueOrThrow({ where: { imei } })).toMatchObject({
      status: 'sold',
      orderId: order.id,
    });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'handed_over' });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .toMatchObject({ status: 'completed' });
    expect(await prisma.accountingJournalEntry.findUnique({
      where: { sourceType_sourceRef: { sourceType: 'order_line.handover', sourceRef: order.items[0].id } },
    })).not.toBeNull();
  });

  it('receives quantity-tracked supply into its customer allocation without free stock', async () => {
    const product = await toOrderProduct({ trackingMode: 'quantity' });
    const buyer = await customer();
    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price * 2,
      items: [{ sku: product.sku, qty: 2, price: product.price }],
    }, buyer.id, `quantity-receipt-order-${seq}`);
    const deposit = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderId: order.id, kind: 'supply_deposit' },
    });
    await payments.settleReceivable(
      deposit.id,
      { method: 'card', amount: deposit.amount, txnId: `quantity-receipt-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `quantity-receipt-pay-${runId}-${seq}` },
    );
    const supply = await prisma.orderLineSupply.findUniqueOrThrow({
      where: { orderItemId: order.items[0].id },
      include: { purchaseOrderItem: true },
    });
    const purchaseOrderId = supply.purchaseOrderItem!.purchaseOrderId;
    await procurement.send(purchaseOrderId, 'staff:test-procurement');
    await lineSupply.markInTransit(order.items[0].id, 'staff:test-procurement');
    const payload = {
      idempotencyKey: `quantity-receipt-po-${runId}-${seq}`,
      lines: [{ itemId: supply.purchaseOrderItemId!, qty: 2 }],
    };

    const attempts = await Promise.all([
      procurement.receive(purchaseOrderId, payload, 'staff:test-warehouse'),
      procurement.receive(purchaseOrderId, payload, 'staff:test-warehouse'),
    ]);

    expect(attempts.map((attempt) => attempt.idempotent).sort()).toEqual([false, true]);
    expect(await prisma.purchaseReceipt.count({ where: { purchaseOrderId } })).toBe(1);
    expect(await prisma.orderLineSupply.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } }))
      .toMatchObject({ status: 'received', receivedQty: 2 });
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } }))
      .toMatchObject({ fulfillmentStatus: 'received' });
    expect(await prisma.inventoryBalance.count({ where: { productId: product.id } })).toBe(0);
    expect(await prisma.deviceUnit.count({ where: { productId: product.id } })).toBe(0);
    const allocation = await prisma.supplyQuantityAllocation.findFirstOrThrow({
      where: { orderLineSupplyId: supply.id },
    });
    expect(allocation).toMatchObject({
      productId: product.id,
      qty: 2,
      unitCost: product.cost,
      active: true,
      consumedAt: null,
      valuationIssueId: null,
    });

    const balance = await prisma.orderReceivable.findFirstOrThrow({
      where: { orderItemId: order.items[0].id, kind: 'supply_balance' },
    });
    await payments.settleReceivable(
      balance.id,
      { method: 'card', amount: balance.amount, txnId: `quantity-balance-${runId}-${seq}` },
      'staff:test-cashier',
      { staffId: 'test-cashier', idempotencyKey: `quantity-balance-pay-${runId}-${seq}` },
    );
    await lineSupply.markQualityChecked(order.items[0].id, 'staff:test-warehouse');
    await lineSupply.markReady(order.items[0].id, 'staff:test-warehouse');
    const handedOver = await lineSupply.markHandedOver(order.items[0].id, 'staff:test-seller');
    const replayedHandover = await lineSupply.markHandedOver(order.items[0].id, 'staff:test-seller');

    expect(handedOver).toMatchObject({ status: 'handed_over', idempotent: false });
    expect(replayedHandover).toMatchObject({ status: 'handed_over', idempotent: true });
    const consumed = await prisma.supplyQuantityAllocation.findUniqueOrThrow({ where: { id: allocation.id } });
    expect(consumed).toMatchObject({
      active: false,
      consumedAt: expect.any(Date),
      valuationIssueId: expect.any(String),
    });
    expect(await prisma.inventoryValuationIssue.findUniqueOrThrow({
      where: { id: consumed.valuationIssueId! },
    })).toMatchObject({
      productId: product.id,
      orderId: order.id,
      sourceType: 'supply-quantity.sale',
      sourceRef: allocation.id,
      quantity: 2,
      unitCost: product.cost,
      totalCost: product.cost * 2,
    });
    expect(await prisma.accountingJournalEntry.count({
      where: { sourceType: 'inventory.cogs', sourceRef: consumed.valuationIssueId! },
    })).toBe(1);
    expect(await prisma.inventoryBalance.count({ where: { productId: product.id } })).toBe(0);

    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'Проверка возврата поставочного количества',
        status: 'paid',
        refundAmount: order.total,
        isFullOrder: true,
      },
    });
    await returns.transition(ret.id, 'reconciled', 'staff:test-warehouse', 'BISHKEK-1');
    expect(await prisma.supplyQuantityAllocation.findUniqueOrThrow({ where: { id: allocation.id } }))
      .toMatchObject({ returnedQty: 2 });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({
      where: { productId_location: { productId: product.id, location: 'BISHKEK-1' } },
    })).toMatchObject({ onHand: 2, inventoryValue: product.cost * 2 });
    expect(await prisma.inventoryValuationIssue.findUniqueOrThrow({
      where: { id: consumed.valuationIssueId! },
    })).toMatchObject({ reversedQty: 2 });
  });

  it('queues no-show reminders once and creates exactly one owner task on day 14', async () => {
    const buyer = await customer();
    await prisma.staffUser.create({
      data: {
        username: `supply-owner-${runId}-${seq}`,
        passwordHash: 'test-only-not-a-real-credential',
        role: 'owner',
        point: 'BISHKEK-1',
      },
    });
    const readyAt = new Date('2026-07-01T06:00:00.000Z');
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'web',
        fulfillmentType: 'pickup',
        status: 'ready_for_pickup',
        total: 10_000,
        items: {
          create: {
            sku: `NO-SHOW-${seq}`,
            qty: 1,
            price: 10_000,
            fulfillmentStatus: 'ready',
            readyAt,
          },
        },
      },
    });
    const now = new Date('2026-07-15T06:00:00.000Z');

    const sweeps = await Promise.all([
      orders.sweepNoShow({ now }),
      orders.sweepNoShow({ now }),
    ]);

    expect(sweeps.reduce((sum, result) => sum + result.reminders, 0)).toBe(4);
    expect(sweeps.reduce((sum, result) => sum + result.ownerTasks, 0)).toBe(1);
    expect(await prisma.auditEvent.count({
      where: { type: 'order.no_show_reminder_queued', refs: { has: order.id } },
    })).toBe(4);
    const ownerTasks = await prisma.staffTask.findMany({
      where: { relatedType: 'order_no_show', relatedId: order.id },
      include: { assignee: { select: { role: true } } },
    });
    expect(ownerTasks).toHaveLength(1);
    expect(['owner', 'admin']).toContain(ownerTasks[0].assignee.role);
  });

  it('refuses reserve() and fulfill() on a confirmed to_order order, leaving InventoryBalance untouched', async () => {
    const product = await toOrderProduct();
    // Simulate a stray balance row (e.g. a warehouse count correction) to prove
    // the guard blocks reservation even when stock happens to exist — not just
    // when availability is zero.
    const balance = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'BISHKEK-1', onHand: 5, reserved: 0 },
    });
    const buyer = await customer();

    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `confirm-${seq}`);
    // Deposit settlement will own the legitimate awaiting_payment → confirmed
    // transition. Force the later state here to isolate the stock guard.
    await prisma.order.update({ where: { id: order.id }, data: { status: 'confirmed' } });

    const before = await prisma.inventoryBalance.findUnique({ where: { id: balance.id } });

    await expect(orders.reserve(order.id, 'staff')).rejects.toMatchObject({ code: 'to_order_not_reservable' });
    expect(await prisma.inventoryBalance.findUnique({ where: { id: balance.id } })).toEqual(before);
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);

    await expect(orders.fulfill(order.id, 'staff')).rejects.toMatchObject({ code: 'to_order_not_reservable' });
    expect(await prisma.inventoryBalance.findUnique({ where: { id: balance.id } })).toEqual(before);
    expect(await prisma.reservation.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('confirmed');
  });

  it('payments.pay() refuses a to_order line even if the reserved gate is bypassed directly in the DB', async () => {
    const product = await toOrderProduct();
    const balance = await prisma.inventoryBalance.create({
      data: { productId: product.id, location: 'BISHKEK-1', onHand: 3, reserved: 0 },
    });
    const buyer = await customer();

    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `pay-${seq}`);
    // reserve()/fulfill() now refuse this order (tested above), so the only way
    // to reach a payable status is to corrupt it directly — exactly the defense
    // this guard exists for.
    await prisma.order.update({ where: { id: order.id }, data: { status: 'reserved' } });

    await expect(payments.pay({
      orderId: order.id,
      amount: product.price,
      method: 'card',
      txnId: `to-order-pay-${runId}-${seq}`,
    }, 'cashier')).rejects.toMatchObject({ code: 'order_uses_receivable_schedule' });

    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.inventoryBalance.findUnique({ where: { id: balance.id } })).toEqual(balance);
  });

  it('leaves the own-stock happy path unchanged: reserves, pays, and decrements stock', async () => {
    const product = await ownStockProduct();
    await inventory.receiveQuantity({
      idempotencyKey: `to-order-slice2-receive-${runId}-${seq}`,
      productId: product.id,
      location: 'BISHKEK-1',
      quantity: 3,
    }, 'warehouse');
    const buyer = await customer();

    const order = await orders.createFromCatalog({
      customerId: buyer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      pickupPoint: 'BISHKEK-1',
      total: product.price,
      items: [{ sku: product.sku, qty: 1, price: product.price }],
    }, buyer.id, `own-happy-${seq}`);
    expect(order.status).toBe('created');

    await orders.fulfill(order.id, 'staff');
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 3, reserved: 1 });

    const paid = await payments.pay({
      orderId: order.id,
      amount: product.price,
      method: 'card',
      txnId: `own-happy-pay-${runId}-${seq}`,
    }, 'cashier');
    expect(paid.order?.status).toBe('paid');
    expect(await prisma.inventoryBalance.findFirst({ where: { productId: product.id } }))
      .toMatchObject({ onHand: 2, reserved: 0 });
  });
});
