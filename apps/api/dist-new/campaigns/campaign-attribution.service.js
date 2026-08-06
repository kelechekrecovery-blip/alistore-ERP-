"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignAttributionService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
let CampaignAttributionService = class CampaignAttributionService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async trackPublic(input) {
        const campaign = await this.prisma.campaign.findFirst({
            where: { trackingCode: input.trackingCode, status: { in: ['active', 'paused'] } },
            select: { id: true },
        });
        if (!campaign)
            return { accepted: true, recorded: false };
        const recorded = await this.recordStageOnTx(this.prisma, campaign.id, this.hashJourney(input.journeyId), input.stage);
        return { accepted: true, recorded };
    }
    async prepareForOrder(tx, customerId, input, promotionCode) {
        if (!input && !promotionCode)
            return null;
        const trackingCode = input?.last.campaign ?? input?.first.campaign;
        const campaign = trackingCode
            ? await tx.campaign.findFirst({
                where: { trackingCode, status: { in: ['active', 'paused'] } },
            })
            : promotionCode
                ? await tx.campaign.findFirst({
                    where: {
                        promotionCode: { equals: promotionCode, mode: 'insensitive' },
                        status: { in: ['active', 'paused'] },
                    },
                    orderBy: { createdAt: 'desc' },
                })
                : null;
        if (!input && !campaign)
            return null;
        const first = this.touch(input?.first, campaign?.source ?? 'promotion', campaign?.medium);
        const last = this.touch(input?.last, campaign?.source ?? 'promotion', campaign?.medium);
        return {
            campaignId: campaign?.id ?? null,
            data: {
                campaignId: campaign?.id ?? null,
                journeyHash: input?.journeyId ? this.hashJourney(input.journeyId) : null,
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
    async attachForBackfill(tx, campaignId, orderId) {
        const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign)
            throw new errors_1.ValidationError('campaign_not_found', `Кампания ${campaignId} не найдена`);
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true } });
        if (!order)
            throw new errors_1.ValidationError('order_not_found', `Заказ ${orderId} не найден`);
        const existing = await tx.orderAttribution.findUnique({ where: { orderId } });
        if (existing?.campaignId && existing.campaignId !== campaignId) {
            throw new errors_1.ConflictError('campaign_attribution_locked', 'Заказ уже связан с другой кампанией');
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
        }
        else if (!existing.campaignId) {
            await tx.orderAttribution.update({
                where: { orderId },
                data: { campaignId, lastSource: campaign.source, lastMedium: campaign.medium, lastCampaign: campaign.trackingCode },
            });
        }
    }
    async convertPaidOrderOnTx(tx, orderId, actor, events) {
        const attribution = await tx.orderAttribution.findUnique({
            where: { orderId },
            include: { order: { include: { items: true } } },
        });
        if (!attribution?.campaignId || attribution.convertedAt)
            return null;
        const received = await tx.payment.aggregate({
            where: { orderId, amount: { gt: 0 }, status: { in: ['received', 'reconciled'] } },
            _sum: { amount: true },
        });
        const paid = received._sum.amount ?? 0;
        if (paid < attribution.order.total)
            return null;
        const revenue = Math.min(paid, attribution.order.total);
        const cost = attribution.order.items.reduce((sum, item) => sum + item.unitCost * item.qty, 0);
        const grossProfit = revenue - cost;
        const claimed = await tx.orderAttribution.updateMany({
            where: { id: attribution.id, convertedAt: null },
            data: { convertedAt: new Date(), revenue, grossProfit },
        });
        if (claimed.count !== 1)
            return null;
        const campaign = await tx.campaign.update({
            where: { id: attribution.campaignId },
            data: {
                orders: { increment: 1 },
                revenue: { increment: revenue },
                grossProfit: { increment: grossProfit },
            },
        });
        if (attribution.journeyHash) {
            await this.recordStageOnTx(tx, campaign.id, attribution.journeyHash, 'conversion', orderId);
        }
        events.push({
            type: event_types_1.EventType.CampaignConverted,
            actor,
            payload: { campaignId: campaign.id, orderId, revenue, grossProfit, source: campaign.source, medium: campaign.medium },
            refs: [campaign.id, orderId, attribution.id],
        });
        return { campaign, revenue, grossProfit };
    }
    async recordCheckoutOnTx(tx, campaignId, journeyHash, orderId) {
        if (!journeyHash)
            return false;
        return this.recordStageOnTx(tx, campaignId, journeyHash, 'checkout', orderId);
    }
    async recordStageOnTx(tx, campaignId, sessionHash, stage, orderId) {
        const created = await tx.campaignFunnelEvent.createMany({
            data: [{ campaignId, sessionHash, stage, orderId: orderId ?? null }],
            skipDuplicates: true,
        });
        return created.count === 1;
    }
    hashJourney(journeyId) {
        return (0, node_crypto_1.createHash)('sha256').update(journeyId).digest('hex');
    }
    touch(input, fallbackSource, fallbackMedium) {
        return {
            source: input?.source.trim() || fallbackSource,
            medium: input?.medium?.trim() || fallbackMedium || null,
            campaign: input?.campaign?.trim() || null,
            content: input?.content?.trim() || null,
            term: input?.term?.trim() || null,
            landing: input?.landing?.trim() || null,
        };
    }
};
exports.CampaignAttributionService = CampaignAttributionService;
exports.CampaignAttributionService = CampaignAttributionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CampaignAttributionService);
//# sourceMappingURL=campaign-attribution.service.js.map