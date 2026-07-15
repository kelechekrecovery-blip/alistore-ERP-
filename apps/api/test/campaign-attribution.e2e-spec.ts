import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { UnitsService } from '../src/units/units.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { CampaignAttributionService } from '../src/campaigns/campaign-attribution.service';
import { PromotionsService } from '../src/promotions/promotions.service';
import { CampaignsService } from '../src/campaigns/campaigns.service';

describe('Campaign attribution → paid conversion (integration)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let approvals: ApprovalsService;
  let attribution: CampaignAttributionService;
  let campaignMetrics: CampaignsService;
  const run = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    const units = new UnitsService(prisma);
    attribution = new CampaignAttributionService(prisma);
    approvals = new ApprovalsService(prisma, audit);
    orders = new OrdersService(
      prisma, audit, units, undefined, undefined, undefined,
      new PromotionsService(prisma, audit), attribution,
    );
    payments = new PaymentsService(
      prisma,
      audit,
      units,
      approvals,
      undefined,
      undefined,
      attribution,
    );
    campaignMetrics = new CampaignsService(prisma, audit, undefined as never, attribution);
  });

  afterAll(async () => {
    const testOrders = await prisma.order.findMany({
      where: { idempotencyKey: { startsWith: `mkt005-${run}` } }, select: { id: true },
    });
    const orderIds = testOrders.map((order) => order.id);
    await prisma.reservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderQuantityAllocation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.promotionCode.deleteMany({ where: { code: { startsWith: 'MKT005' } } });
    await prisma.campaign.deleteMany({ where: { trackingCode: { startsWith: `cmp_${run}` } } });
    await prisma.inventoryBalance.deleteMany({ where: { product: { sku: { startsWith: `MKT005-${run}` } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: `MKT005-${run}` } } });
    await prisma.customer.deleteMany({ where: { phone: { startsWith: `+99655${run.slice(-7)}` } } });
    await prisma.$disconnect();
  });

  it('binds a promotion fallback, preserves touches, and converts a paid order once with server cost', async () => {
    const point = await prisma.storePoint.upsert({
      where: { id: 'alistore-bishkek-1' },
      update: { active: true, inventoryLocation: 'BISHKEK-1' },
      create: {
        id: 'alistore-bishkek-1', code: 'center', name: 'AliStore Центр',
        address: 'Бишкек, ул. Киевская 95', inventoryLocation: 'BISHKEK-1',
        hours: '10:00–21:00', active: true, sortOrder: 0,
        createdBy: 'mkt005-test', idempotencyKey: 'mkt005-test-store-point',
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: `MKT005-${run}`, name: 'Attributed accessory', price: 10000, cost: 4000,
        category: 'accessories', trackingMode: 'quantity', attrs: {},
        balances: { create: { location: point.inventoryLocation, onHand: 2 } },
      },
    });
    const customer = await prisma.customer.create({
      data: { phone: `+99655${run.slice(-7)}01`, name: 'Attributed buyer', consent: true },
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: 'July paid social', trackingCode: `cmp_${run}`, source: 'instagram', medium: 'paid_social',
        promotionCode: `MKT005${run.slice(-6)}`,
        segment: '{}', channel: 'push', budget: 2000,
      },
    });
    await prisma.promotionCode.create({
      data: {
        code: campaign.promotionCode!, name: 'Campaign fallback promo', status: 'active',
        discountType: 'fixed', discountValue: 1000, minimumSubtotal: 0,
        eligibleProductIds: [], eligibleCategories: [], createdBy: 'mkt005-test', updatedBy: 'mkt005-test',
      },
    });
    const journeyId = '9a89ddf4-a2a7-4735-a544-8a58d732ad47';
    expect(await attribution.trackPublic({ trackingCode: campaign.trackingCode, journeyId, stage: 'click' }))
      .toEqual({ accepted: true, recorded: true });
    expect(await attribution.trackPublic({ trackingCode: campaign.trackingCode, journeyId, stage: 'click' }))
      .toEqual({ accepted: true, recorded: false });
    expect(await attribution.trackPublic({ trackingCode: campaign.trackingCode, journeyId, stage: 'visit' }))
      .toEqual({ accepted: true, recorded: true });

    const order = await orders.createFromCatalog({
      customerId: customer.id,
      channel: 'web',
      fulfillmentType: 'pickup',
      storePointId: point.id,
      total: 1,
      promoCode: campaign.promotionCode!,
      attribution: {
        journeyId,
        first: { source: 'google', medium: 'organic', landing: '/catalog' },
        last: {
          source: 'spoofed-client-source', medium: 'spoofed-client-medium',
          content: 'hero-a', landing: '/product/test',
        },
      },
      items: [{ sku: product.sku, qty: 1, price: 1 }],
    }, customer.id, `mkt005-${run}-order`);

    const stored = await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(stored).toMatchObject({
      campaignId: campaign.id,
      firstSource: 'google',
      firstMedium: 'organic',
      lastSource: 'instagram',
      lastMedium: 'paid_social',
      lastCampaign: campaign.trackingCode,
      lastContent: 'hero-a',
      convertedAt: null,
    });
    expect(await prisma.orderItem.findFirst({ where: { orderId: order.id } })).toMatchObject({
      price: 10000,
      unitCost: 4000,
    });
    await orders.fulfill(order.id, 'warehouse-mkt005');

    expect(order).toMatchObject({ promoCode: campaign.promotionCode, promoDiscount: 1000, total: 9000 });
    const firstPayment = await payments.pay({ orderId: order.id, amount: 4500, method: 'card', txnId: `mkt005-${run}-pay-1` }, 'cashier-mkt005');
    expect(await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ orders: 0, revenue: 0, grossProfit: 0 });

    const completed = await payments.pay({ orderId: order.id, amount: 4500, method: 'card', txnId: `mkt005-${run}-pay-2` }, 'cashier-mkt005');
    const replay = await payments.pay({ orderId: order.id, amount: 4500, method: 'card', txnId: `mkt005-${run}-pay-2` }, 'cashier-mkt005');
    expect(completed.order?.status).toBe('paid');
    expect(replay.idempotent).toBe(true);
    expect(await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({
      orders: 1,
      revenue: 9000,
      grossProfit: 5000,
    });
    expect(await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      revenue: 9000,
      grossProfit: 5000,
    });
    expect(await prisma.auditEvent.count({ where: { type: 'campaign.attributed', refs: { has: order.id } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'campaign.converted', refs: { has: order.id } } })).toBe(1);
    expect(await prisma.campaignFunnelEvent.groupBy({
      by: ['stage'], where: { campaignId: campaign.id }, _count: { _all: true },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'click', _count: { _all: 1 } }),
      expect.objectContaining({ stage: 'visit', _count: { _all: 1 } }),
      expect.objectContaining({ stage: 'checkout', _count: { _all: 1 } }),
      expect.objectContaining({ stage: 'conversion', _count: { _all: 1 } }),
    ]));
    const storedFunnel = await prisma.campaignFunnelEvent.findMany({ where: { campaignId: campaign.id } });
    expect(storedFunnel.every((event) => event.sessionHash.length === 64)).toBe(true);
    expect(JSON.stringify(storedFunnel)).not.toContain(journeyId);

    const partialRefund = await payments.refund(
      firstPayment.payment.id,
      4500,
      'partial campaign return',
      'support-mkt006',
    );
    await approvals.decide(partialRefund.approvalId, {
      status: 'approved', approver: 'admin-mkt006', approverRole: 'admin',
    });
    expect(await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      refundedRevenue: 4500,
      refundedCost: 2000,
    });
    expect(await prisma.campaignRefundAdjustment.count({ where: { campaignId: campaign.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { type: 'campaign.refund_adjusted', refs: { has: order.id } } })).toBe(1);
    expect(await campaignMetrics.roiFor(campaign.id)).toMatchObject({
      revenue: 9000,
      refundRevenue: 4500,
      netRevenue: 4500,
      grossProfit: 5000,
      netGrossProfit: 2500,
      paidRoas: 4.5,
      roas: 2.25,
      funnel: { clicks: 1, visits: 1, checkouts: 1, conversions: 1, conversionRate: 100 },
    });

    await expect(approvals.decide(partialRefund.approvalId, {
      status: 'approved', approver: 'admin-mkt006', approverRole: 'admin',
    })).rejects.toMatchObject({ code: 'approval_already_decided' });
    expect(await prisma.campaignRefundAdjustment.count({ where: { campaignId: campaign.id } })).toBe(1);

    const finalRefund = await payments.refund(
      completed.payment.id,
      4500,
      'final campaign return',
      'support-mkt006',
    );
    await approvals.decide(finalRefund.approvalId, {
      status: 'approved', approver: 'admin-mkt006', approverRole: 'admin',
    });
    expect(await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      refundedRevenue: 9000,
      refundedCost: 4000,
    });
    expect(await prisma.campaignRefundAdjustment.count({ where: { campaignId: campaign.id } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { type: 'campaign.refund_adjusted', refs: { has: order.id } } })).toBe(2);
    expect(await campaignMetrics.roiFor(campaign.id)).toMatchObject({
      refundRevenue: 9000,
      netRevenue: 0,
      netGrossProfit: 0,
      roas: 0,
    });
  });
});
