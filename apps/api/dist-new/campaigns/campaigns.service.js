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
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const outbox_service_1 = require("../outbox/outbox.service");
const prisma_service_1 = require("../prisma/prisma.service");
const campaign_attribution_service_1 = require("./campaign-attribution.service");
const campaign_creative_policy_service_1 = require("./campaign-creative-policy.service");
const segment_builder_1 = require("./segment-builder");
const AUDIENCE_SCAN_LIMIT = 5_000;
let CampaignsService = class CampaignsService {
    constructor(prisma, audit, outbox, attribution, creativePolicy) {
        this.prisma = prisma;
        this.audit = audit;
        this.outbox = outbox;
        this.attribution = attribution;
        this.creativePolicy = creativePolicy;
    }
    async preview(rules) {
        const normalized = (0, segment_builder_1.normalizeSegmentRules)(rules);
        const all = await this.loadCustomersWithSpend(this.prisma);
        const matched = (0, segment_builder_1.buildSegmentAudience)(all, normalized);
        const audience = this.eligibleAudience(matched, normalized.limit);
        return {
            rules: normalized,
            description: (0, segment_builder_1.describeSegment)(normalized),
            totalCustomers: all.length,
            matchedCustomers: matched.length,
            eligibleCustomers: audience.length,
            excludedNoConsent: matched.length - audience.length,
            audience: audience.map((customer) => this.customerView(customer)),
        };
    }
    list() {
        return this.prisma.campaign
            .findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
            .then((campaigns) => Promise.all(campaigns.map((campaign) => this.roiFor(campaign.id))));
    }
    async create(dto, actor) {
        await this.creativePolicy?.assertAllowed(dto);
        const normalized = (0, segment_builder_1.normalizeSegmentRules)(dto);
        const creative = this.creativeInput(dto);
        return this.audit.transaction(async (tx) => {
            const campaign = await tx.campaign.create({
                data: {
                    name: dto.name?.trim() || `Campaign · ${dto.channel}`,
                    trackingCode: `cmp_${(0, node_crypto_1.randomBytes)(6).toString('base64url')}`,
                    source: dto.source?.trim() || 'alistore_crm',
                    medium: dto.medium?.trim() || dto.channel,
                    promotionCode: dto.promotionCode?.trim().toUpperCase() || null,
                    segment: (0, segment_builder_1.segmentLabel)(normalized),
                    channel: dto.channel,
                    budget: dto.budget,
                    ...creative,
                    createdBy: actor,
                    updatedBy: actor,
                },
            });
            return {
                result: { campaign, rules: normalized, description: (0, segment_builder_1.describeSegment)(normalized), queued: 0 },
                events: [{
                        type: event_types_1.EventType.CampaignCreated,
                        actor,
                        payload: { campaignId: campaign.id, budget: campaign.budget, channel: campaign.channel },
                        refs: [campaign.id],
                    }],
            };
        });
    }
    async update(id, dto, actor) {
        await this.creativePolicy?.assertAllowed(dto);
        return this.audit.transaction(async (tx) => {
            const campaign = await this.lockCampaign(tx, id);
            if (campaign.status !== 'draft') {
                throw new errors_1.ConflictError('campaign_not_draft', 'Редактировать можно только черновик кампании');
            }
            const currentRules = (0, segment_builder_1.parseSegmentLabel)(campaign.segment);
            const normalized = (0, segment_builder_1.normalizeSegmentRules)({ ...currentRules, ...this.ruleInput(dto) });
            const creative = this.creativeInput({
                creativeHeadline: dto.creativeHeadline ?? campaign.creativeHeadline,
                creativeType: dto.creativeType ?? campaign.creativeType,
                creativeBody: dto.creativeBody ?? campaign.creativeBody ?? undefined,
                creativeAssetUrl: dto.creativeAssetUrl ?? campaign.creativeAssetUrl ?? undefined,
                creativeCtaLabel: dto.creativeCtaLabel ?? campaign.creativeCtaLabel ?? undefined,
                destinationUrl: dto.destinationUrl ?? campaign.destinationUrl,
                template: dto.template ?? campaign.template,
            });
            const updated = await tx.campaign.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
                    ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
                    ...(dto.budget !== undefined ? { budget: dto.budget } : {}),
                    ...(dto.source !== undefined ? { source: dto.source.trim() } : {}),
                    ...(dto.medium !== undefined ? { medium: dto.medium.trim() } : {}),
                    ...(dto.promotionCode !== undefined
                        ? { promotionCode: dto.promotionCode.trim().toUpperCase() || null }
                        : {}),
                    segment: (0, segment_builder_1.segmentLabel)(normalized),
                    ...creative,
                    rejectionReason: null,
                    updatedBy: actor,
                },
            });
            return {
                result: updated,
                events: [{
                        type: event_types_1.EventType.CampaignUpdated,
                        actor,
                        payload: { campaignId: id, budget: updated.budget, channel: updated.channel },
                        refs: [id],
                    }],
            };
        });
    }
    async submit(id, actor) {
        return this.audit.transaction(async (tx) => {
            const campaign = await this.lockCampaign(tx, id);
            if (campaign.status !== 'draft') {
                throw new errors_1.ConflictError('campaign_not_draft', 'На согласование можно отправить только черновик');
            }
            const approval = await tx.approval.create({
                data: {
                    action: 'campaign_budget',
                    requester: actor,
                    reason: `Согласование бюджета кампании «${campaign.name}»`,
                    status: 'requested',
                    evidence: {
                        payload: { campaignId: id, budget: campaign.budget },
                        evidence: { channel: campaign.channel, segment: campaign.segment },
                    },
                },
            });
            const updated = await tx.campaign.update({
                where: { id },
                data: { status: 'review', approvalId: approval.id, reviewedAt: new Date(), updatedBy: actor },
            });
            return {
                result: updated,
                events: [
                    {
                        type: event_types_1.EventType.ApprovalRequested,
                        actor,
                        payload: { approvalId: approval.id, action: 'campaign_budget', campaignId: id },
                        refs: [approval.id, id],
                    },
                    {
                        type: event_types_1.EventType.CampaignReviewSubmitted,
                        actor,
                        payload: { campaignId: id, approvalId: approval.id, budget: campaign.budget },
                        refs: [id, approval.id],
                    },
                ],
            };
        });
    }
    async activate(id, actor) {
        return this.audit.transaction(async (tx) => {
            const campaign = await this.lockCampaign(tx, id);
            if (campaign.status !== 'approved' && campaign.status !== 'paused') {
                throw new errors_1.ConflictError('campaign_not_activatable', 'Кампания должна быть согласована или приостановлена');
            }
            const spend = await this.sumSpend(tx, id);
            if (campaign.budget > 0 && spend >= campaign.budget) {
                throw new errors_1.ConflictError('campaign_budget_exhausted', 'Бюджет кампании исчерпан');
            }
            const normalized = (0, segment_builder_1.parseSegmentLabel)(campaign.segment);
            const matched = (0, segment_builder_1.buildSegmentAudience)(await this.loadCustomersWithSpend(tx), normalized);
            const audience = this.eligibleAudience(matched, normalized.limit ?? 500);
            if (audience.length === 0) {
                throw new errors_1.ValidationError('campaign_empty_audience', 'В сегменте нет клиентов с согласием на рассылку');
            }
            const eligibleIds = audience.map((customer) => customer.id);
            await tx.outboxMessage.updateMany({
                where: { campaignId: id, status: 'pending' },
                data: { status: 'cancelled' },
            });
            const alreadySent = await tx.outboxMessage.findMany({
                where: { campaignId: id, status: 'sent' },
                select: { recipient: true },
            });
            const sentRecipients = new Set(alreadySent.map((message) => message.recipient));
            let queued = 0;
            const trackingUrl = this.trackingUrl(campaign);
            for (const customer of audience) {
                const recipient = this.recipientFor(campaign.channel, customer);
                if (sentRecipients.has(recipient))
                    continue;
                await this.outbox.enqueueOnTx(tx, {
                    campaignId: id,
                    channel: campaign.channel,
                    recipient,
                    template: campaign.template,
                    payload: {
                        campaignId: id,
                        customerId: customer.id,
                        headline: campaign.creativeHeadline,
                        body: campaign.creativeBody,
                        assetUrl: campaign.creativeAssetUrl,
                        ctaLabel: campaign.creativeCtaLabel,
                        trackingUrl,
                    },
                });
                queued += 1;
            }
            await tx.campaignRecipient.createMany({
                data: eligibleIds.map((customerId) => ({ campaignId: id, customerId, consentAtSend: true })),
                skipDuplicates: true,
            });
            const updated = await tx.campaign.update({
                where: { id },
                data: {
                    status: 'active',
                    activatedAt: campaign.activatedAt ?? new Date(),
                    pausedAt: null,
                    updatedBy: actor,
                },
            });
            return {
                result: {
                    campaign: updated,
                    queued,
                    excludedNoConsent: matched.length - audience.length,
                    trackingUrl,
                },
                events: [
                    {
                        type: event_types_1.EventType.CampaignActivated,
                        actor,
                        payload: { campaignId: id, queued, spend, budget: campaign.budget },
                        refs: [id],
                    },
                    {
                        type: event_types_1.EventType.CampaignSent,
                        actor,
                        payload: { campaignId: id, queued, channel: campaign.channel, trackingUrl },
                        refs: [id, ...eligibleIds],
                    },
                ],
            };
        });
    }
    async pause(id, actor) {
        return this.changeStatus(id, actor, 'active', 'paused', event_types_1.EventType.CampaignPaused);
    }
    async complete(id, actor) {
        return this.audit.transaction(async (tx) => {
            const campaign = await this.lockCampaign(tx, id);
            if (!['approved', 'active', 'paused'].includes(campaign.status)) {
                throw new errors_1.ConflictError('campaign_not_completable', 'Эту кампанию нельзя завершить');
            }
            const cancelled = await tx.outboxMessage.updateMany({
                where: { campaignId: id, status: 'pending' },
                data: { status: 'cancelled' },
            });
            const updated = await tx.campaign.update({
                where: { id },
                data: { status: 'completed', completedAt: new Date(), updatedBy: actor },
            });
            return {
                result: updated,
                events: [{
                        type: event_types_1.EventType.CampaignCompleted,
                        actor,
                        payload: { campaignId: id, cancelledMessages: cancelled.count },
                        refs: [id],
                    }],
            };
        });
    }
    async recordSpend(id, dto, actor) {
        const existing = await this.prisma.campaignSpendEntry.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) {
            if (existing.campaignId !== id || existing.provider !== dto.provider.trim()
                || existing.externalRef !== dto.externalRef.trim() || existing.amount !== dto.amount) {
                throw new errors_1.ConflictError('idempotency_payload_mismatch', 'Idempotency-Key уже использован с другими данными');
            }
            return this.roiFor(id);
        }
        await this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${'campaign-spend:' + dto.idempotencyKey}))::text AS locked`;
            const raced = await tx.campaignSpendEntry.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
            if (raced) {
                if (raced.campaignId !== id || raced.provider !== dto.provider.trim()
                    || raced.externalRef !== dto.externalRef.trim() || raced.amount !== dto.amount) {
                    throw new errors_1.ConflictError('idempotency_payload_mismatch', 'Idempotency-Key уже использован с другими данными');
                }
                return { result: raced, events: [] };
            }
            const campaign = await this.lockCampaign(tx, id);
            if (campaign.status === 'draft' || campaign.status === 'review') {
                throw new errors_1.ConflictError('campaign_not_approved', 'Расход можно провести только по согласованной кампании');
            }
            const entry = await tx.campaignSpendEntry.create({
                data: {
                    campaignId: id,
                    idempotencyKey: dto.idempotencyKey,
                    provider: dto.provider.trim(),
                    externalRef: dto.externalRef.trim(),
                    amount: dto.amount,
                    occurredAt: new Date(dto.occurredAt),
                    actor,
                },
            });
            const spend = await this.sumSpend(tx, id);
            const events = [{
                    type: event_types_1.EventType.CampaignSpendRecorded,
                    actor,
                    payload: { campaignId: id, spendEntryId: entry.id, amount: entry.amount, totalSpend: spend },
                    refs: [id, entry.id],
                }];
            if (campaign.status === 'active' && campaign.budget > 0 && spend >= campaign.budget) {
                const cancelled = await tx.outboxMessage.updateMany({
                    where: { campaignId: id, status: 'pending' },
                    data: { status: 'cancelled' },
                });
                await tx.campaign.update({
                    where: { id },
                    data: { status: 'paused', pausedAt: new Date(), updatedBy: actor },
                });
                events.push({
                    type: event_types_1.EventType.CampaignBudgetExhausted,
                    actor,
                    payload: { campaignId: id, budget: campaign.budget, spend, cancelledMessages: cancelled.count },
                    refs: [id],
                });
            }
            return { result: entry, events };
        });
        return this.roiFor(id);
    }
    async recordConversion(id, orderId, actor) {
        await this.audit.transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
            await this.attribution.attachForBackfill(tx, id, orderId);
            const events = [];
            await this.attribution.convertPaidOrderOnTx(tx, orderId, actor, events);
            return { result: null, events };
        });
        return this.roiFor(id);
    }
    async roiFor(id) {
        const [campaign, refunds, funnelRows, spend, deliveryRows] = await Promise.all([
            this.prisma.campaign.findUnique({ where: { id } }),
            this.prisma.campaignRefundAdjustment.aggregate({
                where: { campaignId: id },
                _sum: { revenue: true, restoredCost: true },
            }),
            this.prisma.campaignFunnelEvent.groupBy({
                by: ['stage'], where: { campaignId: id }, _count: { _all: true },
            }),
            this.prisma.campaignSpendEntry.aggregate({ where: { campaignId: id }, _sum: { amount: true } }),
            this.prisma.outboxMessage.groupBy({
                by: ['status'], where: { campaignId: id }, _count: { _all: true },
            }),
        ]);
        if (!campaign)
            throw new errors_1.ValidationError('campaign_not_found', `Кампания ${id} не найдена`);
        const funnel = new Map(funnelRows.map((row) => [row.stage, row._count._all]));
        const delivery = new Map(deliveryRows.map((row) => [row.status, row._count._all]));
        return this.roiView(campaign, spend._sum.amount ?? 0, refunds._sum.revenue ?? 0, refunds._sum.restoredCost ?? 0, {
            clicks: funnel.get('click') ?? 0,
            visits: funnel.get('visit') ?? 0,
            checkouts: funnel.get('checkout') ?? 0,
            conversions: funnel.get('conversion') ?? 0,
        }, {
            pending: delivery.get('pending') ?? 0,
            sent: delivery.get('sent') ?? 0,
            failed: delivery.get('failed') ?? 0,
            cancelled: delivery.get('cancelled') ?? 0,
        });
    }
    async changeStatus(id, actor, expected, next, eventType) {
        return this.audit.transaction(async (tx) => {
            const campaign = await this.lockCampaign(tx, id);
            if (campaign.status !== expected) {
                throw new errors_1.ConflictError('campaign_not_active', 'Приостановить можно только активную кампанию');
            }
            const cancelled = await tx.outboxMessage.updateMany({
                where: { campaignId: id, status: 'pending' },
                data: { status: 'cancelled' },
            });
            const updated = await tx.campaign.update({
                where: { id },
                data: { status: next, pausedAt: new Date(), updatedBy: actor },
            });
            return {
                result: updated,
                events: [{
                        type: eventType,
                        actor,
                        payload: { campaignId: id, cancelledMessages: cancelled.count },
                        refs: [id],
                    }],
            };
        });
    }
    async lockCampaign(tx, id) {
        await tx.$queryRaw `SELECT id FROM "Campaign" WHERE id = ${id} FOR UPDATE`;
        const campaign = await tx.campaign.findUnique({ where: { id } });
        if (!campaign)
            throw new errors_1.ValidationError('campaign_not_found', `Кампания ${id} не найдена`);
        return campaign;
    }
    async sumSpend(tx, campaignId) {
        const result = await tx.campaignSpendEntry.aggregate({
            where: { campaignId },
            _sum: { amount: true },
        });
        return result._sum.amount ?? 0;
    }
    creativeInput(input) {
        const creativeHeadline = input.creativeHeadline.trim();
        const creativeType = input.creativeType ?? 'text';
        const creativeAssetUrl = input.creativeAssetUrl?.trim() || null;
        const destinationUrl = input.destinationUrl?.trim() || '/';
        if (!creativeHeadline)
            throw new errors_1.ValidationError('campaign_headline_required', 'Укажите заголовок кампании');
        if (creativeAssetUrl && !creativeAssetUrl.startsWith('https://')) {
            throw new errors_1.ValidationError('campaign_asset_must_be_https', 'Медиа кампании должно использовать HTTPS');
        }
        if (creativeType !== 'text' && !creativeAssetUrl) {
            throw new errors_1.ValidationError('campaign_asset_required', 'Для изображения или видео нужен медиа-файл');
        }
        if (!destinationUrl.startsWith('/') || destinationUrl.startsWith('//')) {
            throw new errors_1.ValidationError('campaign_destination_invalid', 'Переход кампании должен вести на внутренний маршрут');
        }
        return {
            creativeType: creativeType,
            creativeHeadline,
            creativeBody: input.creativeBody?.trim() || null,
            creativeAssetUrl,
            creativeCtaLabel: input.creativeCtaLabel?.trim() || null,
            destinationUrl,
            template: input.template?.trim() || 'campaign_offer',
        };
    }
    ruleInput(input) {
        return {
            ...(input.level !== undefined ? { level: input.level } : {}),
            ...(input.city !== undefined ? { city: input.city } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
            ...(input.minSpent !== undefined ? { minSpent: input.minSpent } : {}),
            ...(input.maxSpent !== undefined ? { maxSpent: input.maxSpent } : {}),
            ...(input.minLtv !== undefined ? { minLtv: input.minLtv } : {}),
            ...(input.maxLtv !== undefined ? { maxLtv: input.maxLtv } : {}),
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
        };
    }
    trackingUrl(campaign) {
        const separator = campaign.destinationUrl.includes('?') ? '&' : '?';
        return `${campaign.destinationUrl}${separator}utm_source=${encodeURIComponent(campaign.source)}&utm_medium=${encodeURIComponent(campaign.medium)}&utm_campaign=${encodeURIComponent(campaign.trackingCode)}`;
    }
    async loadCustomersWithSpend(client) {
        const customers = await client.$queryRaw `
      SELECT
        c."id",
        c."name",
        c."phone",
        c."consent",
        c."segments",
        c."ltv",
        COALESCE(SUM(CASE WHEN p."status" = 'received' AND p."amount" > 0 THEN p."amount" ELSE 0 END), 0)::bigint AS "spent"
      FROM "Customer" c
      LEFT JOIN "Order" o ON o."customerId" = c."id"
      LEFT JOIN "Payment" p ON p."orderId" = o."id"
      GROUP BY c."id", c."name", c."phone", c."consent", c."segments", c."ltv", c."createdAt"
      ORDER BY c."createdAt" ASC
      LIMIT ${AUDIENCE_SCAN_LIMIT}
    `;
        return customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            consent: customer.consent,
            segments: customer.segments,
            ltv: customer.ltv,
            spent: Number(customer.spent),
        }));
    }
    roiView(campaign, spend = 0, refundRevenue = 0, restoredCost = 0, funnel = { clicks: 0, visits: 0, checkouts: 0, conversions: 0 }, delivery = { pending: 0, sent: 0, failed: 0, cancelled: 0 }) {
        const netRevenue = campaign.revenue - refundRevenue;
        const netGrossProfit = campaign.grossProfit - (refundRevenue - restoredCost);
        const contribution = netGrossProfit - spend;
        const conversionRate = funnel.visits > 0
            ? Math.round((funnel.conversions / funnel.visits) * 10_000) / 100
            : null;
        const rules = (0, segment_builder_1.parseSegmentLabel)(campaign.segment);
        return {
            campaign,
            rules,
            description: (0, segment_builder_1.describeSegment)(rules),
            orders: campaign.orders,
            revenue: campaign.revenue,
            budget: campaign.budget,
            spend,
            profit: contribution,
            grossProfit: campaign.grossProfit,
            refundRevenue,
            restoredCost,
            netRevenue,
            netGrossProfit,
            contribution,
            paidRoas: spend > 0 ? Math.round((campaign.revenue / spend) * 100) / 100 : null,
            roas: spend > 0 ? Math.round((netRevenue / spend) * 100) / 100 : null,
            roiPct: spend > 0 ? Math.round((contribution / spend) * 1000) / 10 : null,
            delivery,
            funnel: { ...funnel, conversionRate },
        };
    }
    eligibleAudience(matched, limit) {
        return matched.filter((row) => row.eligible).slice(0, limit).map((row) => row.customer);
    }
    recipientFor(channel, customer) {
        if (channel === 'push')
            return customer.id;
        if (channel === 'telegram')
            return this.segmentValue(customer, ['telegram:', 'tg:']) ?? customer.phone;
        return customer.phone;
    }
    segmentValue(customer, prefixes) {
        for (const segment of customer.segments) {
            const trimmed = segment.trim();
            const normalized = trimmed.toLowerCase();
            const prefix = prefixes.find((candidate) => normalized.startsWith(candidate));
            if (!prefix)
                continue;
            const value = trimmed.slice(prefix.length).trim();
            if (value)
                return value;
        }
        return undefined;
    }
    customerView(customer) {
        return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            segments: customer.segments,
            ltv: customer.ltv,
            spent: customer.spent,
        };
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        outbox_service_1.OutboxService,
        campaign_attribution_service_1.CampaignAttributionService,
        campaign_creative_policy_service_1.CampaignCreativePolicyService])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map