import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';

type Tx = Prisma.TransactionClient;

export async function applyCampaignRefundOnTx(
  tx: Tx,
  input: {
    orderId: string;
    refundPaymentId: string;
    returnId: string | null;
    amount: number;
    actor: string;
  },
  events: AuditInput[],
) {
  await tx.$queryRaw`SELECT id FROM "OrderAttribution" WHERE "orderId" = ${input.orderId} FOR UPDATE`;
  const attribution = await tx.orderAttribution.findUnique({ where: { orderId: input.orderId } });
  if (!attribution?.campaignId || !attribution.convertedAt || input.amount <= 0) return null;

  const originalCost = Math.max(0, attribution.revenue - attribution.grossProfit);
  const remainingRevenue = Math.max(0, attribution.revenue - attribution.refundedRevenue);
  const remainingCost = Math.max(0, originalCost - attribution.refundedCost);
  const revenue = Math.min(input.amount, remainingRevenue);
  if (revenue <= 0) return null;

  let restoredCost = 0;
  if (input.returnId) {
    const returned = await tx.returnItem.findMany({
      where: { returnId: input.returnId },
      include: { orderItem: { select: { unitCost: true } } },
    });
    restoredCost = returned.reduce((sum, item) => sum + item.qty * item.orderItem.unitCost, 0);
  } else if (attribution.revenue > 0) {
    restoredCost = Math.round((originalCost * revenue) / attribution.revenue);
  }
  restoredCost = Math.min(remainingCost, Math.max(0, restoredCost));

  const created = await tx.campaignRefundAdjustment.createMany({
    data: [{
      campaignId: attribution.campaignId,
      attributionId: attribution.id,
      refundPaymentId: input.refundPaymentId,
      returnId: input.returnId,
      revenue,
      restoredCost,
    }],
    skipDuplicates: true,
  });
  if (created.count !== 1) return null;

  await tx.orderAttribution.update({
    where: { id: attribution.id },
    data: {
      refundedRevenue: { increment: revenue },
      refundedCost: { increment: restoredCost },
    },
  });
  const grossProfitReduction = revenue - restoredCost;
  events.push({
    type: EventType.CampaignRefundAdjusted,
    actor: input.actor,
    payload: {
      campaignId: attribution.campaignId,
      orderId: input.orderId,
      refundPaymentId: input.refundPaymentId,
      returnId: input.returnId,
      revenue,
      restoredCost,
      grossProfitReduction,
    },
    refs: [attribution.campaignId, input.orderId, attribution.id, input.refundPaymentId, input.returnId]
      .filter((ref): ref is string => Boolean(ref)),
  });
  return { revenue, restoredCost, grossProfitReduction };
}
