import { Injectable } from '@nestjs/common';
import { Campaign, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxChannel } from '../outbox/outbox.types';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAttributionService } from './campaign-attribution.service';
import { CampaignCreativePolicyService } from './campaign-creative-policy.service';
import { CreateCampaignDto, RecordCampaignSpendDto, UpdateCampaignDto } from './campaigns.dto';
import {
  AudienceCustomer,
  buildSegmentAudience,
  describeSegment,
  normalizeSegmentRules,
  parseSegmentLabel,
  segmentLabel,
  SegmentRules,
} from './segment-builder';

type PrismaLike = PrismaService | Prisma.TransactionClient;

export interface CampaignRoi {
  campaign: Campaign;
  rules: SegmentRules;
  description: string;
  orders: number;
  revenue: number;
  budget: number;
  spend: number;
  profit: number;
  grossProfit: number;
  refundRevenue: number;
  restoredCost: number;
  netRevenue: number;
  netGrossProfit: number;
  contribution: number;
  paidRoas: number | null;
  roas: number | null;
  roiPct: number | null;
  delivery: { pending: number; sent: number; failed: number; cancelled: number };
  funnel: {
    clicks: number;
    visits: number;
    checkouts: number;
    conversions: number;
    conversionRate: number | null;
  };
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly attribution: CampaignAttributionService,
    private readonly creativePolicy?: CampaignCreativePolicyService,
  ) {}

  async preview(rules: SegmentRules) {
    const normalized = normalizeSegmentRules(rules);
    const all = await this.loadCustomersWithSpend(this.prisma);
    const matched = buildSegmentAudience(all, normalized);
    const audience = this.eligibleAudience(matched, normalized.limit);
    return {
      rules: normalized,
      description: describeSegment(normalized),
      totalCustomers: all.length,
      matchedCustomers: matched.length,
      eligibleCustomers: audience.length,
      excludedNoConsent: matched.length - audience.length,
      audience: audience.map((customer) => this.customerView(customer)),
    };
  }

  list(): Promise<CampaignRoi[]> {
    return this.prisma.campaign
      .findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      .then((campaigns) => Promise.all(campaigns.map((campaign) => this.roiFor(campaign.id))));
  }

  async create(dto: CreateCampaignDto, actor: string) {
    await this.creativePolicy?.assertAllowed(dto);
    const normalized = normalizeSegmentRules(dto);
    const creative = this.creativeInput(dto);
    return this.audit.transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: dto.name?.trim() || `Campaign · ${dto.channel}`,
          trackingCode: `cmp_${randomBytes(6).toString('base64url')}`,
          source: dto.source?.trim() || 'alistore_crm',
          medium: dto.medium?.trim() || dto.channel,
          promotionCode: dto.promotionCode?.trim().toUpperCase() || null,
          segment: segmentLabel(normalized),
          channel: dto.channel,
          budget: dto.budget,
          ...creative,
          createdBy: actor,
          updatedBy: actor,
        },
      });
      return {
        result: { campaign, rules: normalized, description: describeSegment(normalized), queued: 0 },
        events: [{
          type: EventType.CampaignCreated,
          actor,
          payload: { campaignId: campaign.id, budget: campaign.budget, channel: campaign.channel },
          refs: [campaign.id],
        }],
      };
    });
  }

  async update(id: string, dto: UpdateCampaignDto, actor: string) {
    await this.creativePolicy?.assertAllowed(dto);
    return this.audit.transaction(async (tx) => {
      const campaign = await this.lockCampaign(tx, id);
      if (campaign.status !== 'draft') {
        throw new ConflictError('campaign_not_draft', 'Редактировать можно только черновик кампании');
      }
      const currentRules = parseSegmentLabel(campaign.segment);
      const normalized = normalizeSegmentRules({ ...currentRules, ...this.ruleInput(dto) });
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
          segment: segmentLabel(normalized),
          ...creative,
          rejectionReason: null,
          updatedBy: actor,
        },
      });
      return {
        result: updated,
        events: [{
          type: EventType.CampaignUpdated,
          actor,
          payload: { campaignId: id, budget: updated.budget, channel: updated.channel },
          refs: [id],
        }],
      };
    });
  }

  async submit(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const campaign = await this.lockCampaign(tx, id);
      if (campaign.status !== 'draft') {
        throw new ConflictError('campaign_not_draft', 'На согласование можно отправить только черновик');
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
          } as Prisma.InputJsonValue,
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
            type: EventType.ApprovalRequested,
            actor,
            payload: { approvalId: approval.id, action: 'campaign_budget', campaignId: id },
            refs: [approval.id, id],
          },
          {
            type: EventType.CampaignReviewSubmitted,
            actor,
            payload: { campaignId: id, approvalId: approval.id, budget: campaign.budget },
            refs: [id, approval.id],
          },
        ],
      };
    });
  }

  async activate(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const campaign = await this.lockCampaign(tx, id);
      if (campaign.status !== 'approved' && campaign.status !== 'paused') {
        throw new ConflictError('campaign_not_activatable', 'Кампания должна быть согласована или приостановлена');
      }
      const spend = await this.sumSpend(tx, id);
      if (campaign.budget > 0 && spend >= campaign.budget) {
        throw new ConflictError('campaign_budget_exhausted', 'Бюджет кампании исчерпан');
      }
      const normalized = parseSegmentLabel(campaign.segment);
      const matched = buildSegmentAudience(await this.loadCustomersWithSpend(tx), normalized);
      const audience = this.eligibleAudience(matched, normalized.limit ?? 500);
      if (audience.length === 0) {
        throw new ValidationError('campaign_empty_audience', 'В сегменте нет клиентов с согласием на рассылку');
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
        if (sentRecipients.has(recipient)) continue;
        await this.outbox.enqueueOnTx(tx, {
          campaignId: id,
          channel: campaign.channel as OutboxChannel,
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
            type: EventType.CampaignActivated,
            actor,
            payload: { campaignId: id, queued, spend, budget: campaign.budget },
            refs: [id],
          },
          {
            type: EventType.CampaignSent,
            actor,
            payload: { campaignId: id, queued, channel: campaign.channel, trackingUrl },
            refs: [id, ...eligibleIds],
          },
        ],
      };
    });
  }

  async pause(id: string, actor: string) {
    return this.changeStatus(id, actor, 'active', 'paused', EventType.CampaignPaused);
  }

  async complete(id: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      const campaign = await this.lockCampaign(tx, id);
      if (!['approved', 'active', 'paused'].includes(campaign.status)) {
        throw new ConflictError('campaign_not_completable', 'Эту кампанию нельзя завершить');
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
          type: EventType.CampaignCompleted,
          actor,
          payload: { campaignId: id, cancelledMessages: cancelled.count },
          refs: [id],
        }],
      };
    });
  }

  async recordSpend(id: string, dto: RecordCampaignSpendDto, actor: string) {
    const existing = await this.prisma.campaignSpendEntry.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (
        existing.campaignId !== id || existing.provider !== dto.provider.trim()
        || existing.externalRef !== dto.externalRef.trim() || existing.amount !== dto.amount
      ) {
        throw new ConflictError('idempotency_payload_mismatch', 'Idempotency-Key уже использован с другими данными');
      }
      return this.roiFor(id);
    }
    await this.audit.transaction(async (tx) => {
      // Serialize concurrent identical requests on the idempotency key and
      // re-check inside the tx (mirrors refunds). Without this, two requests
      // that both pass the pre-check above race into create() and the loser
      // surfaces a raw unique-constraint error instead of a clean replay.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'campaign-spend:' + dto.idempotencyKey}))::text AS locked`;
      const raced = await tx.campaignSpendEntry.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (raced) {
        if (
          raced.campaignId !== id || raced.provider !== dto.provider.trim()
          || raced.externalRef !== dto.externalRef.trim() || raced.amount !== dto.amount
        ) {
          throw new ConflictError('idempotency_payload_mismatch', 'Idempotency-Key уже использован с другими данными');
        }
        return { result: raced, events: [] };
      }
      const campaign = await this.lockCampaign(tx, id);
      if (campaign.status === 'draft' || campaign.status === 'review') {
        throw new ConflictError('campaign_not_approved', 'Расход можно провести только по согласованной кампании');
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
      const events: AuditInput[] = [{
        type: EventType.CampaignSpendRecorded,
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
          type: EventType.CampaignBudgetExhausted,
          actor,
          payload: { campaignId: id, budget: campaign.budget, spend, cancelledMessages: cancelled.count },
          refs: [id],
        });
      }
      return { result: entry, events };
    });
    return this.roiFor(id);
  }

  async recordConversion(id: string, orderId: string, actor: string) {
    await this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      await this.attribution.attachForBackfill(tx, id, orderId);
      const events: Parameters<CampaignAttributionService['convertPaidOrderOnTx']>[3] = [];
      await this.attribution.convertPaidOrderOnTx(tx, orderId, actor, events);
      return { result: null, events };
    });
    return this.roiFor(id);
  }

  async roiFor(id: string): Promise<CampaignRoi> {
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
    if (!campaign) throw new ValidationError('campaign_not_found', `Кампания ${id} не найдена`);
    const funnel = new Map(funnelRows.map((row) => [row.stage, row._count._all]));
    const delivery = new Map(deliveryRows.map((row) => [row.status, row._count._all]));
    return this.roiView(
      campaign,
      spend._sum.amount ?? 0,
      refunds._sum.revenue ?? 0,
      refunds._sum.restoredCost ?? 0,
      {
        clicks: funnel.get('click') ?? 0,
        visits: funnel.get('visit') ?? 0,
        checkouts: funnel.get('checkout') ?? 0,
        conversions: funnel.get('conversion') ?? 0,
      },
      {
        pending: delivery.get('pending') ?? 0,
        sent: delivery.get('sent') ?? 0,
        failed: delivery.get('failed') ?? 0,
        cancelled: delivery.get('cancelled') ?? 0,
      },
    );
  }

  private async changeStatus(
    id: string,
    actor: string,
    expected: 'active',
    next: 'paused',
    eventType: string,
  ) {
    return this.audit.transaction(async (tx) => {
      const campaign = await this.lockCampaign(tx, id);
      if (campaign.status !== expected) {
        throw new ConflictError('campaign_not_active', 'Приостановить можно только активную кампанию');
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

  private async lockCampaign(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${id} FOR UPDATE`;
    const campaign = await tx.campaign.findUnique({ where: { id } });
    if (!campaign) throw new ValidationError('campaign_not_found', `Кампания ${id} не найдена`);
    return campaign;
  }

  private async sumSpend(tx: Prisma.TransactionClient, campaignId: string) {
    const result = await tx.campaignSpendEntry.aggregate({
      where: { campaignId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  private creativeInput(input: {
    creativeHeadline: string;
    creativeType?: string;
    creativeBody?: string;
    creativeAssetUrl?: string;
    creativeCtaLabel?: string;
    destinationUrl?: string;
    template?: string;
  }) {
    const creativeHeadline = input.creativeHeadline.trim();
    const creativeType = input.creativeType ?? 'text';
    const creativeAssetUrl = input.creativeAssetUrl?.trim() || null;
    const destinationUrl = input.destinationUrl?.trim() || '/';
    if (!creativeHeadline) throw new ValidationError('campaign_headline_required', 'Укажите заголовок кампании');
    if (creativeAssetUrl && !creativeAssetUrl.startsWith('https://')) {
      throw new ValidationError('campaign_asset_must_be_https', 'Медиа кампании должно использовать HTTPS');
    }
    if (creativeType !== 'text' && !creativeAssetUrl) {
      throw new ValidationError('campaign_asset_required', 'Для изображения или видео нужен медиа-файл');
    }
    if (!destinationUrl.startsWith('/') || destinationUrl.startsWith('//')) {
      throw new ValidationError('campaign_destination_invalid', 'Переход кампании должен вести на внутренний маршрут');
    }
    return {
      creativeType: creativeType as 'text' | 'image' | 'video',
      creativeHeadline,
      creativeBody: input.creativeBody?.trim() || null,
      creativeAssetUrl,
      creativeCtaLabel: input.creativeCtaLabel?.trim() || null,
      destinationUrl,
      template: input.template?.trim() || 'campaign_offer',
    };
  }

  private ruleInput(input: UpdateCampaignDto): Partial<SegmentRules> {
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

  private trackingUrl(campaign: Campaign) {
    const separator = campaign.destinationUrl.includes('?') ? '&' : '?';
    return `${campaign.destinationUrl}${separator}utm_source=${encodeURIComponent(campaign.source)}&utm_medium=${encodeURIComponent(campaign.medium)}&utm_campaign=${encodeURIComponent(campaign.trackingCode)}`;
  }

  private async loadCustomersWithSpend(client: PrismaLike): Promise<AudienceCustomer[]> {
    const customers = await client.customer.findMany({
      orderBy: { createdAt: 'asc' },
      include: { orders: { select: { payments: { select: { amount: true, status: true } } } } },
    });
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      consent: customer.consent,
      segments: customer.segments,
      ltv: customer.ltv,
      spent: customer.orders.reduce(
        (sum, order) => sum + order.payments.reduce(
          (acc, payment) => payment.status === 'received' && payment.amount > 0 ? acc + payment.amount : acc,
          0,
        ),
        0,
      ),
    }));
  }

  private roiView(
    campaign: Campaign,
    spend = 0,
    refundRevenue = 0,
    restoredCost = 0,
    funnel = { clicks: 0, visits: 0, checkouts: 0, conversions: 0 },
    delivery = { pending: 0, sent: 0, failed: 0, cancelled: 0 },
  ): CampaignRoi {
    const netRevenue = campaign.revenue - refundRevenue;
    const netGrossProfit = campaign.grossProfit - (refundRevenue - restoredCost);
    const contribution = netGrossProfit - spend;
    const conversionRate = funnel.visits > 0
      ? Math.round((funnel.conversions / funnel.visits) * 10_000) / 100
      : null;
    const rules = parseSegmentLabel(campaign.segment);
    return {
      campaign,
      rules,
      description: describeSegment(rules),
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

  private eligibleAudience(
    matched: { customer: AudienceCustomer; eligible: boolean }[],
    limit: number,
  ): AudienceCustomer[] {
    return matched.filter((row) => row.eligible).slice(0, limit).map((row) => row.customer);
  }

  private recipientFor(channel: string, customer: AudienceCustomer): string {
    if (channel === 'push') return customer.id;
    if (channel === 'telegram') return this.segmentValue(customer, ['telegram:', 'tg:']) ?? customer.phone;
    return customer.phone;
  }

  private segmentValue(customer: AudienceCustomer, prefixes: string[]): string | undefined {
    for (const segment of customer.segments) {
      const trimmed = segment.trim();
      const normalized = trimmed.toLowerCase();
      const prefix = prefixes.find((candidate) => normalized.startsWith(candidate));
      if (!prefix) continue;
      const value = trimmed.slice(prefix.length).trim();
      if (value) return value;
    }
    return undefined;
  }

  private customerView(customer: AudienceCustomer) {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      segments: customer.segments,
      ltv: customer.ltv,
      spent: customer.spent,
    };
  }
}
