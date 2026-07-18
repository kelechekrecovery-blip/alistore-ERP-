import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { CourierService } from '../src/courier/courier.service';
import { RefundsService } from '../src/refunds/refunds.service';
import { RefundProcessor } from '../src/refunds/refunds.processor';
import { ReturnsService } from '../src/returns/returns.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { ExchangesService } from '../src/exchanges/exchanges.service';
import { ServiceCenterService } from '../src/service-center/service-center.service';
import { ServiceExecutionService } from '../src/service-center/service-execution.service';
import { ServiceLoanerService } from '../src/service-center/service-loaner.service';
import { TradeInsService } from '../src/tradeins/tradeins.service';
import { SupportService } from '../src/support/support.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { LogNotificationTransport } from '../src/outbox/transports/log.transport';
import { SandboxPaymentGatewayProvider } from '../src/payments/sandbox-payment-gateway.provider';
import { EventType } from '../src/audit/event-types';
import type { PaymentGatewayProvider } from '../src/payments/payment-gateway-provider';

/**
 * NOTIF-003 notification coverage: every meaningful operational event enqueues a
 * consent-filtered customer notice (inbox + outbox in the same transaction as the
 * domain mutation) and managers (owner/admin) get staff pushes for approvals,
 * shifts and cash shortages. Transactional lifecycle notices reach the customer
 * even without marketing consent; promo-class templates stay consent-gated.
 */
describe('Notification coverage NOTIF-003 (integration)', () => {
  let prisma: PrismaService;
  let outbox: OutboxService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let courier: CourierService;
  let refunds: RefundsService;
  let processor: RefundProcessor;
  let returns: ReturnsService;
  let shifts: ShiftsService;
  let approvals: ApprovalsService;
  let exchanges: ExchangesService;
  let serviceCenter: ServiceCenterService;
  let execution: ServiceExecutionService;
  let loaner: ServiceLoanerService;
  let tradeins: TradeInsService;
  let support: SupportService;
  // Run-unique sequence: idempotency keys and journal entries are append-only in
  // the shared test DB, so keys must never repeat across runs.
  let seq = Date.now() % 1_000_000;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    outbox = new OutboxService(prisma, new LogNotificationTransport());
    orders = new OrdersService(prisma, audit, units, outbox);
    exchanges = new ExchangesService(prisma, audit, units, outbox);
    approvals = new ApprovalsService(prisma, audit, exchanges, undefined, outbox);
    payments = new PaymentsService(prisma, audit, units, approvals, undefined, undefined, undefined, outbox);
    courier = new CourierService(prisma, audit, outbox, units);
    refunds = new RefundsService(prisma, audit, outbox);
    processor = new RefundProcessor(prisma, audit, new SandboxPaymentGatewayProvider(), outbox);
    returns = new ReturnsService(prisma, audit, outbox);
    shifts = new ShiftsService(prisma, audit, outbox);
    serviceCenter = new ServiceCenterService(prisma, audit, outbox);
    execution = new ServiceExecutionService(prisma, audit, outbox);
    loaner = new ServiceLoanerService(prisma, audit, outbox);
    tradeins = new TradeInsService(prisma, audit, outbox);
    support = new SupportService(prisma, audit, outbox);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany();
    await prisma.customerNotification.deleteMany();
    // ExchangeRequest is append-only at the DB level (P0001) — truncate like exchange.e2e-spec.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExchangeRequest" CASCADE');
    await prisma.courierCommand.deleteMany();
    await prisma.serviceWorkOrderCommand.deleteMany();
    await prisma.servicePart.deleteMany();
    await prisma.loanerLoan.deleteMany();
    await prisma.loanerDevice.deleteMany();
    await prisma.serviceWorkOrder.deleteMany();
    await prisma.warrantyCase.deleteMany();
    await prisma.refundAllocation.deleteMany();
    await prisma.refundLine.deleteMany();
    await prisma.refund.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.inventoryQuarantineCase.deleteMany();
    await prisma.returnItem.deleteMany();
    await prisma.return.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.supportTicket.deleteMany();
    await prisma.tradeInDevice.deleteMany();
    await prisma.loyaltyEntry.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.courierRun.deleteMany();
    await prisma.cashShiftHandover.deleteMany();
    await prisma.cashShift.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.$transaction([
      prisma.inventoryValuationReversal.deleteMany(),
      prisma.inventoryValuationIssue.deleteMany(),
    ]);
    await prisma.deviceUnit.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany({ where: { phone: { startsWith: '+9965550199' } } });
    await prisma.staffUser.deleteMany({ where: { username: { startsWith: 'notif-' } } });
  });

  function nextSeq() {
    seq += 1;
    return seq;
  }

  async function customer(consent: boolean) {
    const n = nextSeq();
    return prisma.customer.create({
      data: {
        phone: `+9965550199${n.toString().padStart(2, '0')}`,
        name: consent ? 'Notif Consent' : 'Notif OptOut',
        consent,
      },
    });
  }

  async function staff(role: 'owner' | 'admin' | 'cashier' | 'courier' | 'technician' | 'service', point = 'BISHKEK-1') {
    const n = nextSeq();
    return prisma.staffUser.create({
      data: { username: `notif-${role}-${n}`, passwordHash: 'test-only', role, point },
    });
  }

  async function outboxFor(template: string) {
    return prisma.outboxMessage.findMany({ where: { template }, orderBy: { createdAt: 'asc' } });
  }

  async function inboxFor(customerId: string, template: string) {
    return prisma.customerNotification.findMany({ where: { customerId, template } });
  }

  async function expectCustomerNotice(template: string, customerId: string, phone: string) {
    const messages = await outboxFor(template);
    expect(messages).toHaveLength(1);
    expect(messages[0].channel).toBe('sms');
    expect(messages[0].recipient).toBe(phone);
    expect(messages[0].payload).toMatchObject({ customerId });
    const inbox = await inboxFor(customerId, template);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].title.length).toBeGreaterThan(0);
    return messages[0];
  }

  it('notifies the customer when the order is fully paid (payment_received)', async () => {
    const buyer = await customer(true);
    const n = nextSeq();
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'pos',
        total: 5000,
        status: 'reserved',
        fulfillmentLocation: 'BISHKEK-1',
      },
    });

    await payments.pay(
      { orderId: order.id, method: 'card', amount: 5000, txnId: `nc-txn-${n}` },
      'notif-staff',
      { idempotencyKey: `nc-pay-${n}` },
    );

    const message = await expectCustomerNotice('payment_received', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ orderId: order.id, total: 5000 });
  });

  it('sends transactional notices without marketing consent while promo stays gated', async () => {
    const optedOut = await customer(false);
    const n = nextSeq();
    const item = await prisma.product.create({
      data: { sku: `NC-PROMO-${n}`, name: 'Case', price: 1000, cost: 700, category: 'acc', attrs: {} },
    });

    await orders.create(
      {
        customerId: optedOut.id,
        channel: 'web',
        total: 1000,
        items: [{ sku: item.sku, qty: 1, price: 1000 }],
      },
      'web',
    );
    // Promo-class template (order_confirmed) stays consent-gated.
    expect(await outboxFor('order_confirmed')).toHaveLength(0);
    expect(await inboxFor(optedOut.id, 'order_confirmed')).toHaveLength(0);

    const order = await prisma.order.create({
      data: {
        customerId: optedOut.id,
        channel: 'pos',
        total: 2000,
        status: 'reserved',
        fulfillmentLocation: 'BISHKEK-1',
      },
    });
    await payments.pay(
      { orderId: order.id, method: 'card', amount: 2000, txnId: `nc-txn-${n}` },
      'notif-staff',
      { idempotencyKey: `nc-pay-${n}` },
    );

    // Transactional lifecycle notice reaches the customer even without consent.
    await expectCustomerNotice('payment_received', optedOut.id, optedOut.phone);
  });

  it('notifies the customer when the courier delivers (order_delivered)', async () => {
    const buyer = await customer(true);
    const rider = await staff('courier');
    const n = nextSeq();
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'pos',
        total: 10000,
        status: 'paid',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
      },
    });

    await courier.createRun({ courierId: rider.id, orderIds: [order.id], codTotal: 10000 }, 'dispatcher', `nc-run-${n}`);
    await courier.startDelivery(order.id, rider.id, `nc-out-${n}`);
    await courier.completeDelivery(order.id, { codAmount: 10000 }, rider.id, `nc-deliver-${n}`);

    const message = await expectCustomerNotice('order_delivered', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ orderId: order.id });
  });

  it('notifies the customer when the delivery fails (delivery_failed)', async () => {
    const buyer = await customer(true);
    const rider = await staff('courier');
    const n = nextSeq();
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'pos',
        total: 8000,
        status: 'paid',
        fulfillmentType: 'courier',
        paymentMode: 'cod',
      },
    });

    await courier.createRun({ courierId: rider.id, orderIds: [order.id], codTotal: 8000 }, 'dispatcher', `nc-run-${n}`);
    await courier.startDelivery(order.id, rider.id, `nc-out-${n}`);
    await courier.failDelivery(order.id, { reason: 'клиент не отвечает' }, rider.id, `nc-fail-${n}`);

    const message = await expectCustomerNotice('delivery_failed', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ orderId: order.id, reason: 'клиент не отвечает' });
  });

  it('notifies the customer when the order is completed (order_completed)', async () => {
    const buyer = await customer(true);
    const order = await prisma.order.create({
      data: { customerId: buyer.id, channel: 'pos', total: 7000, status: 'ready_for_pickup' },
    });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 7000, method: 'card', status: 'received', txnId: `nc-done-${order.id}` },
    });

    await orders.transition(order.id, 'completed', 'notif-staff');

    const message = await expectCustomerNotice('order_completed', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ orderId: order.id });
  });

  async function refundFixture(options: { withCash?: boolean } = {}) {
    const buyer = await customer(true);
    const n = nextSeq();
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'pos',
        status: 'paid',
        total: 100000,
        taxBaseAmount: 89286,
        taxAmount: 10714,
        items: {
          create: {
            sku: `NC-REF-${n}`,
            qty: 1,
            price: 100000,
            taxCode: 'vat_standard',
            taxRateBps: 1200,
            taxBaseAmount: 89286,
            taxAmount: 10714,
          },
        },
      },
      include: { items: true },
    });
    const card = await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'card', status: 'received', txnId: `nc-card-${n}`, point: 'BISHKEK-1' },
    });
    let shift = null;
    if (options.withCash) {
      shift = await prisma.cashShift.create({ data: { staffId: 'notif-cashier-1', point: 'BISHKEK-1', openCash: 50000 } });
    }
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'notif refund',
        status: 'processing',
        refundAmount: 100000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 100000 } },
      },
    });
    return { buyer, order, card, shift, ret };
  }

  it('notifies the customer on refund approval and success (refund_approved/refund_succeeded)', async () => {
    const f = await refundFixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'товар возвращён' },
      'notif-cashier-1',
      `nc-refund-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, { status: 'approved', approver: 'notif-admin-2', approverRole: 'admin' });

    const approvedMessage = await expectCustomerNotice('refund_approved', f.buyer.id, f.buyer.phone);
    expect(approvedMessage.payload).toMatchObject({ refundId: requested!.id, orderId: f.order.id, amount: 100000 });

    await processor.processRefund(requested!.id, 'system:notif');

    const succeededMessage = await expectCustomerNotice('refund_succeeded', f.buyer.id, f.buyer.phone);
    expect(succeededMessage.payload).toMatchObject({ refundId: requested!.id, amount: 100000 });
  });

  it('notifies the customer when the refund execution fails (refund_failed)', async () => {
    const f = await refundFixture();
    const requested = await refunds.request(
      f.ret.id,
      { reason: 'provider outage' },
      'notif-cashier-1',
      `nc-refund-fail-${f.ret.id}`,
    );
    await approvals.decide(requested!.approvalId!, { status: 'approved', approver: 'notif-admin-2', approverRole: 'admin' });
    const failingGateway: PaymentGatewayProvider = {
      name: 'sandbox',
      assertOperational() {},
      createIntent: () => Promise.reject(new Error('not used')),
      verifyWebhook: () => Promise.reject(new Error('not used')),
      verifyRefundWebhook: (input) => Promise.resolve(input.payload as never),
      refund: () => Promise.reject(new Error('provider permanent rejection')),
    };
    const failingProcessor = new RefundProcessor(prisma, new AuditService(prisma), failingGateway, outbox);

    await expect(failingProcessor.processRefund(requested!.id, 'system:notif-fail'))
      .rejects.toThrow('provider permanent rejection');
    expect((await refunds.get(requested!.id))?.status).toBe('failed');

    const message = await expectCustomerNotice('refund_failed', f.buyer.id, f.buyer.phone);
    expect(message.payload).toMatchObject({ refundId: requested!.id });
  });

  it('notifies the customer when the return is reconciled (return_reconciled)', async () => {
    const buyer = await customer(true);
    const n = nextSeq();
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'pos',
        status: 'paid',
        total: 3000,
        items: { create: { sku: `NC-RET-${n}`, qty: 1, price: 3000 } },
      },
      include: { items: true },
    });
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        reason: 'notif return',
        status: 'paid',
        refundAmount: 3000,
        items: { create: { orderItemId: order.items[0].id, qty: 1, refundAmount: 3000 } },
      },
    });

    await returns.transition(ret.id, 'reconciled', 'notif-staff', 'BISHKEK-1');

    const message = await expectCustomerNotice('return_reconciled', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ returnId: ret.id, orderId: order.id });
  });

  it('notifies the customer when the repair estimate is ready and the repair is completed', async () => {
    const buyer = await customer(true);
    const owner = await staff('owner');
    const tech = await staff('technician');
    const n = nextSeq();
    const warrantyCase = await prisma.warrantyCase.create({
      data: {
        imei: `NC-SVC-${n}`,
        customerId: buyer.id,
        problem: 'не включается',
        status: 'created',
        sla: new Date(Date.now() + 86400000),
      },
    });
    const workOrder = (await serviceCenter.create(
      { warrantyCaseId: warrantyCase.id, technicianId: tech.id },
      owner.id,
      `nc-svc-create-${n}`,
    )) as { id: string };

    await serviceCenter.diagnose(
      workOrder.id,
      { summary: 'замена батареи', estimateAmount: 5000 },
      owner.id,
      `nc-svc-diag-${n}`,
    );
    const estimateMessage = await expectCustomerNotice('service_estimate_ready', buyer.id, buyer.phone);
    expect(estimateMessage.payload).toMatchObject({ workOrderId: workOrder.id, estimateAmount: 5000 });

    await serviceCenter.approveEstimate(workOrder.id, buyer.id, `nc-svc-approve-${n}`);
    await execution.start(workOrder.id, owner.id, `nc-svc-start-${n}`);
    await execution.complete(workOrder.id, { summary: 'батарея заменена' }, owner.id, `nc-svc-complete-${n}`);

    const repairMessage = await expectCustomerNotice('service_repair_completed', buyer.id, buyer.phone);
    expect(repairMessage.payload).toMatchObject({ workOrderId: workOrder.id });
  });

  it('notifies the customer when a loaner device is issued (service_loaner_issued)', async () => {
    const buyer = await customer(true);
    const owner = await staff('owner');
    const n = nextSeq();
    const product = await prisma.product.create({
      data: { sku: `NC-LOAN-${n}`, name: 'Loaner phone', price: 70000, cost: 50000, category: 'phones', attrs: {} },
    });
    const loanerImei = `NC-LOAN-${n}-DEVICE`;
    await prisma.deviceUnit.create({
      data: { imei: loanerImei, productId: product.id, status: 'in_stock', location: 'BISHKEK-1' },
    });
    const warrantyCase = await prisma.warrantyCase.create({
      data: {
        imei: `NC-LOAN-${n}-REPAIR`,
        customerId: buyer.id,
        problem: 'трещина экрана',
        status: 'received',
        sla: new Date(Date.now() + 86400000),
      },
    });
    const workOrder = await prisma.serviceWorkOrder.create({
      data: { warrantyCaseId: warrantyCase.id, technicianId: owner.id, createdBy: owner.id, point: 'BISHKEK-1' },
    });
    const device = await loaner.register({ imei: loanerImei, condition: 'отличное' }, owner.id, `nc-loan-reg-${n}`);
    const prepared = (await loaner.prepare(
      workOrder.id,
      { loanerDeviceId: device.id, dueAt: new Date(Date.now() + 86400000).toISOString(), issueCondition: 'комплект' },
      owner.id,
      `nc-loan-prep-${n}`,
    )) as { id: string };
    await prisma.auditEvent.create({
      data: {
        type: EventType.EvidenceAttached,
        actor: `staff:${owner.id}`,
        refs: [prepared.id],
        payload: {
          entityType: 'loaner',
          entityId: prepared.id,
          label: 'loaner_issue',
          trustedStaffEvidence: true,
          asset: { key: `${prepared.id}-issue.jpg` },
        },
      },
    });

    await loaner.issue(prepared.id, owner.id, `nc-loan-issue-${n}`);

    const message = await expectCustomerNotice('service_loaner_issued', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ loanId: prepared.id, workOrderId: workOrder.id });
  });

  it('notifies the customer when the exchange is executed (exchange_completed)', async () => {
    const buyer = await customer(true);
    const n = nextSeq();
    const oldProduct = await prisma.product.create({
      data: { sku: `NC-EX-OLD-${n}`, name: 'old phone', price: 100000, cost: 70000, category: 'phones', taxCode: 'vat_standard', taxRateBps: 1200, attrs: {} },
    });
    const newProduct = await prisma.product.create({
      data: { sku: `NC-EX-NEW-${n}`, name: 'new phone', price: 100000, cost: 90000, category: 'phones', taxCode: 'vat_standard', taxRateBps: 1200, attrs: {} },
    });
    const oldImei = `NC-EX-OLD-${n}-1`;
    await prisma.deviceUnit.create({ data: { imei: oldImei, productId: oldProduct.id, status: 'sold', location: 'B', acquisitionCost: 70000 } });
    await prisma.deviceUnit.create({ data: { imei: `NC-EX-NEW-${n}-1`, productId: newProduct.id, status: 'in_stock', location: 'B', acquisitionCost: 90000 } });
    const order = await prisma.order.create({
      data: {
        customerId: buyer.id,
        channel: 'pos',
        storePointCode: 'B',
        fulfillmentLocation: 'B',
        subtotal: 100000,
        total: 100000,
        taxBaseAmount: 89286,
        taxAmount: 10714,
        status: 'paid',
        items: {
          create: [{
            lineNumber: 1,
            sku: oldProduct.sku,
            qty: 1,
            price: 100000,
            unitCost: 70000,
            taxCode: 'vat_standard',
            taxRateBps: 1200,
            taxBaseAmount: 89286,
            taxAmount: 10714,
            imei: oldImei,
          }],
        },
      },
    });
    await prisma.deviceUnit.update({ where: { imei: oldImei }, data: { orderId: order.id } });
    await prisma.payment.create({
      data: { orderId: order.id, amount: 100000, method: 'card', status: 'received', txnId: `nc-ex-pay-${n}` },
    });

    const requested = await exchanges.request(
      { originalOrderId: order.id, oldImei, newProductId: newProduct.id, method: 'card' },
      'notif-cashier-1',
      `nc-exchange-${n}`,
    );
    await prisma.auditEvent.create({
      data: {
        type: EventType.EvidenceAttached,
        actor: 'staff:notif-cashier-1',
        refs: [requested.exchangeRequestId],
        payload: {
          entityType: 'exchange',
          entityId: requested.exchangeRequestId,
          label: 'exchange_condition',
          trustedStaffEvidence: true,
          asset: { key: `exchange/${requested.exchangeRequestId}/condition.webp` },
        },
      },
    });
    await approvals.decide(requested.approvalId, { status: 'approved', approver: 'notif-owner-2', approverRole: 'owner' });

    const message = await expectCustomerNotice('exchange_completed', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ orderId: order.id });
  });

  it('notifies the customer about the trade-in decision (tradein_decision)', async () => {
    const buyer = await customer(true);
    const n = nextSeq();

    const created = await tradeins.create(
      { customerId: buyer.id, model: 'iPhone 12', grade: 'B', price: 15000, sellerPassport: 'AN1234567' },
      'notif-staff',
      `nc-tradein-${n}`,
    );

    const message = await expectCustomerNotice('tradein_decision', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ tradeInId: created.id, price: 15000 });
  });

  it('notifies the customer when support resolves the ticket (ticket_resolved)', async () => {
    const buyer = await customer(true);
    const n = nextSeq();
    const ticket = await support.open(
      { customerId: buyer.id, channel: 'web', subject: 'Не пришёл заказ', body: 'прошло уже 3 дня' },
      buyer.id,
      `nc-ticket-${n}`,
    );

    await support.transition(ticket.id, 'in_progress', { to: 'in_progress' }, 'notif-agent');
    await support.transition(ticket.id, 'resolved', { to: 'resolved' }, 'notif-agent');

    const message = await expectCustomerNotice('ticket_resolved', buyer.id, buyer.phone);
    expect(message.payload).toMatchObject({ ticketId: ticket.id });
  });

  it('pushes approval requests to owner/admin staff (approval_requested)', async () => {
    const owner = await staff('owner');
    const admin = await staff('admin');

    const { approvalId } = await approvals.request({
      action: 'price',
      requester: 'notif-seller-1',
      reason: 'ценник ниже порога',
    });

    const pushes = await outboxFor('approval_requested');
    // Every active owner/admin in the shared test DB gets the push; our two must be among them.
    expect(pushes.map((push) => push.recipient)).toEqual(expect.arrayContaining([owner.id, admin.id]));
    expect(pushes.every((push) => push.channel === 'push')).toBe(true);
    const ownerPush = pushes.find((push) => push.recipient === owner.id);
    expect(ownerPush?.payload).toMatchObject({ approvalId, action: 'price' });
  });

  it('pushes shift lifecycle and cash shortages to owner/admin staff', async () => {
    const owner = await staff('owner');
    const admin = await staff('admin');
    const cashier = await staff('cashier');
    const n = nextSeq();

    const shift = await shifts.open(
      { staffId: cashier.id, point: 'BISHKEK-1', openCash: 10000 },
      cashier.id,
      `nc-shift-open-${n}`,
    );
    const opened = await outboxFor('shift_opened');
    expect(opened.map((push) => push.recipient)).toEqual(expect.arrayContaining([owner.id, admin.id]));
    expect(opened.find((push) => push.recipient === owner.id)?.payload)
      .toMatchObject({ shiftId: shift.id, staffId: cashier.id, openCash: 10000 });

    await shifts.close(
      shift.id,
      { closeCash: 9000, reason: 'недостача при пересчёте' },
      cashier.id,
      `nc-shift-close-${n}`,
      'cashier',
    );
    const closed = await outboxFor('shift_closed');
    expect(closed.map((push) => push.recipient)).toEqual(expect.arrayContaining([owner.id, admin.id]));
    expect(closed.find((push) => push.recipient === owner.id)?.payload)
      .toMatchObject({ shiftId: shift.id, diff: -1000 });
    const shortage = await outboxFor('cash_shortage');
    expect(shortage.map((push) => push.recipient)).toEqual(expect.arrayContaining([owner.id, admin.id]));
    expect(shortage.find((push) => push.recipient === owner.id)?.payload)
      .toMatchObject({ shiftId: shift.id, diff: -1000 });
  });
});
