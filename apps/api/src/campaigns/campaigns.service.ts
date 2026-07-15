import { Injectable } from '@nestjs/common';
import { Campaign, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxChannel } from '../outbox/outbox.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './campaigns.dto';
import { CampaignAttributionService } from './campaign-attribution.service';
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
  profit: number;
  grossProfit: number;
  contribution: number;
  roas: number | null;
  roiPct: number | null;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly attribution: CampaignAttributionService,
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
      .findMany({ orderBy: { id: 'asc' }, take: 100 })
      .then((campaigns) => Promise.all(campaigns.map((campaign) => this.roiFor(campaign.id))));
  }

  async create(dto: CreateCampaignDto, actor: string) {
    const normalized = normalizeSegmentRules(dto);
    return this.audit.transaction(async (tx) => {
      const matched = buildSegmentAudience(await this.loadCustomersWithSpend(tx), normalized);
      const audience = this.eligibleAudience(matched, normalized.limit);
      if (audience.length === 0) {
        throw new ValidationError('campaign_empty_audience', 'В сегменте нет клиентов с согласием на рассылку');
      }
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
        },
      });
      await tx.campaignRecipient.createMany({
        data: audience.map((customer) => ({ campaignId: campaign.id, customerId: customer.id, consentAtSend: true })),
      });
      const trackingUrl = `/?utm_source=${encodeURIComponent(campaign.source)}&utm_medium=${encodeURIComponent(campaign.medium)}&utm_campaign=${encodeURIComponent(campaign.trackingCode)}`;
      for (const customer of audience) {
        await this.outbox.enqueueOnTx(tx, {
          channel: dto.channel as OutboxChannel,
          recipient: this.recipientFor(dto.channel, customer),
          template: dto.template ?? 'campaign_offer',
          payload: {
            campaignId: campaign.id,
            customerId: customer.id,
            message: dto.message ?? null,
            segment: describeSegment(normalized),
            trackingUrl,
          },
        });
      }
      return {
        result: {
          campaign,
          rules: normalized,
          description: describeSegment(normalized),
          queued: audience.length,
          excludedNoConsent: matched.length - audience.length,
        },
        events: [
          {
            type: EventType.CampaignSent,
            actor,
            payload: {
              campaignId: campaign.id,
              channel: dto.channel,
              budget: dto.budget,
              queued: audience.length,
              excludedNoConsent: matched.length - audience.length,
              segment: describeSegment(normalized),
              trackingCode: campaign.trackingCode,
              trackingUrl,
            },
            refs: [campaign.id, ...audience.map((customer) => customer.id)],
          },
        ],
      };
    });
  }

  async recordConversion(id: string, orderId: string, actor: string) {
    return this.audit.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      await this.attribution.attachForBackfill(tx, id, orderId);
      const events: Parameters<CampaignAttributionService['convertPaidOrderOnTx']>[3] = [];
      await this.attribution.convertPaidOrderOnTx(tx, orderId, actor, events);
      const updated = await tx.campaign.findUniqueOrThrow({ where: { id } });
      return {
        result: this.roiView(updated),
        events,
      };
    });
  }

  async roiFor(id: string): Promise<CampaignRoi> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new ValidationError('campaign_not_found', `Кампания ${id} не найдена`);
    }
    return this.roiView(campaign);
  }

  private async loadCustomersWithSpend(client: PrismaLike): Promise<AudienceCustomer[]> {
    const customers = await client.customer.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        orders: {
          select: {
            payments: {
              select: { amount: true, status: true },
            },
          },
        },
      },
    });
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      consent: customer.consent,
      segments: customer.segments,
      ltv: customer.ltv,
      spent: customer.orders.reduce(
        (sum, order) =>
          sum + order.payments.reduce((acc, payment) => (
            payment.status === 'received' && payment.amount > 0 ? acc + payment.amount : acc
          ), 0),
        0,
      ),
    }));
  }

  private roiView(campaign: Campaign): CampaignRoi {
    const contribution = campaign.grossProfit - campaign.budget;
    const rules = parseSegmentLabel(campaign.segment);
    return {
      campaign,
      rules,
      description: describeSegment(rules),
      orders: campaign.orders,
      revenue: campaign.revenue,
      budget: campaign.budget,
      profit: contribution,
      grossProfit: campaign.grossProfit,
      contribution,
      roas: campaign.budget > 0 ? Math.round((campaign.revenue / campaign.budget) * 100) / 100 : null,
      roiPct: campaign.budget > 0 ? Math.round((contribution / campaign.budget) * 1000) / 10 : null,
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
    if (channel === 'telegram') {
      return this.segmentValue(customer, ['telegram:', 'tg:']) ?? customer.phone;
    }
    return customer.phone;
  }

  private segmentValue(
    customer: AudienceCustomer,
    prefixes: string[],
  ): string | undefined {
    for (const segment of customer.segments) {
      const trimmed = segment.trim();
      const normalized = trimmed.toLowerCase();
      const prefix = prefixes.find((candidate) =>
        normalized.startsWith(candidate),
      );
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
