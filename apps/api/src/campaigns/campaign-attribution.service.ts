import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditInput } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OrderAttributionDto, AttributionTouchDto } from './attribution.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CampaignAttributionService {
  async prepareForOrder(
    tx: Tx,
    customerId: string,
    input?: OrderAttributionDto,
    promotionCode?: string | null,
  ) {
    if (!input && !promotionCode) return null;
    const trackingCode = input?.last.campaign ?? input?.first.campaign;
    const campaign = trackingCode
      ? await tx.campaign.findUnique({ where: { trackingCode } })
      : promotionCode
        ? await tx.campaign.findFirst({
            where: { promotionCode: { equals: promotionCode, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    if (!input && !campaign) return null;

    const first = this.touch(input?.first, campaign?.source ?? 'promotion', campaign?.medium);
    const last = this.touch(input?.last, campaign?.source ?? 'promotion', campaign?.medium);
    return {
      campaignId: campaign?.id ?? null,
      data: {
        campaignId: campaign?.id ?? null,
        firstSource: first.source,
        firstMedium: first.medium,
        firstCampaign: first.campaign,
        firstContent: first.content,
        firstTerm: first.term,
        firstLanding: first.landing,
        lastSource: campaign?.source ?? last.source,
        lastMedium: campaign?.medium ?? last.medium,
        lastCampaign: campaign?.trackingCode ?? last.campaign,
        lastContent: last.content,
        lastTerm: last.term,
        lastLanding: last.landing,
        capturedAt: new Date(),
      },
      customerId,
      trackingCode: campaign?.trackingCode ?? null,
    };
  }

  async attachForBackfill(tx: Tx, campaignId: string, orderId: string) {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new ValidationError('campaign_not_found', `Кампания ${campaignId} не найдена`);
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
    const existing = await tx.orderAttribution.findUnique({ where: { orderId } });
    if (existing?.campaignId && existing.campaignId !== campaignId) {
      throw new ConflictError('campaign_attribution_locked', 'Заказ уже связан с другой кампанией');
    }
    if (!existing) {
      await tx.orderAttribution.create({
        data: {
          orderId,
          campaignId,
          firstSource: campaign.source,
          firstMedium: campaign.medium,
          firstCampaign: campaign.trackingCode,
          lastSource: campaign.source,
          lastMedium: campaign.medium,
          lastCampaign: campaign.trackingCode,
          capturedAt: new Date(),
        },
      });
    } else if (!existing.campaignId) {
      await tx.orderAttribution.update({
        where: { orderId },
        data: { campaignId, lastSource: campaign.source, lastMedium: campaign.medium, lastCampaign: campaign.trackingCode },
      });
    }
  }

  async convertPaidOrderOnTx(tx: Tx, orderId: string, actor: string, events: AuditInput[]) {
    const attribution = await tx.orderAttribution.findUnique({
      where: { orderId },
      include: { order: { include: { items: true } } },
    });
    if (!attribution?.campaignId || attribution.convertedAt) return null;

    const received = await tx.payment.aggregate({
      where: { orderId, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
      _sum: { amount: true },
    });
    const paid = received._sum.amount ?? 0;
    if (paid < attribution.order.total) return null;

    const revenue = Math.min(paid, attribution.order.total);
    const cost = attribution.order.items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
    const grossProfit = revenue - cost;
    const claimed = await tx.orderAttribution.updateMany({
      where: { id: attribution.id, convertedAt: null },
      data: { convertedAt: new Date(), revenue, grossProfit },
    });
    if (claimed.count !== 1) return null;
    const campaign = await tx.campaign.update({
      where: { id: attribution.campaignId },
      data: {
        orders: { increment: 1 },
        revenue: { increment: revenue },
        grossProfit: { increment: grossProfit },
      },
    });
    events.push({
      type: EventType.CampaignConverted,
      actor,
      payload: { campaignId: campaign.id, orderId, revenue, grossProfit, source: campaign.source, medium: campaign.medium },
      refs: [campaign.id, orderId, attribution.id],
    });
    return { campaign, revenue, grossProfit };
  }

  private touch(input: AttributionTouchDto | undefined, fallbackSource: string, fallbackMedium?: string) {
    return {
      source: input?.source.trim() || fallbackSource,
      medium: input?.medium?.trim() || fallbackMedium || null,
      campaign: input?.campaign?.trim() || null,
      content: input?.content?.trim() || null,
      term: input?.term?.trim() || null,
      landing: input?.landing?.trim() || null,
    };
  }
}
