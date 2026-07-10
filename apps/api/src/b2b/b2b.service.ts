import { Injectable } from '@nestjs/common';
import { B2BQuoteStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateB2BQuoteDto,
  UpdateB2BQuoteDto,
  UpsertBusinessProfileDto,
} from './b2b.dto';

const STAFF_TRANSITIONS: Record<B2BQuoteStatus, B2BQuoteStatus[]> = {
  requested: ['reviewing', 'rejected'],
  reviewing: ['quoted', 'rejected'],
  quoted: ['rejected'],
  accepted: [],
  rejected: [],
};

@Injectable()
export class B2BService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  profile(customerId: string) {
    return this.prisma.businessBuyerProfile.findUnique({ where: { customerId } });
  }

  async upsertProfile(customerId: string, dto: UpsertBusinessProfileDto) {
    await this.assertCustomer(customerId);
    return this.prisma.businessBuyerProfile.upsert({
      where: { customerId },
      create: { customerId, ...dto },
      update: dto,
    });
  }

  mine(customerId: string) {
    return this.prisma.b2BQuote.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(status?: B2BQuoteStatus) {
    const [quotes, profiles] = await Promise.all([
      this.prisma.b2BQuote.findMany({
        where: status ? { status } : undefined,
        include: { items: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      this.prisma.businessBuyerProfile.findMany(),
    ]);
    const byCustomer = new Map(profiles.map((profile) => [profile.customerId, profile]));
    return quotes.map((quote) => ({
      ...quote,
      profile: byCustomer.get(quote.customerId) ?? null,
    }));
  }

  async request(customerId: string, dto: CreateB2BQuoteDto) {
    await this.assertCustomer(customerId);
    const profile = await this.profile(customerId);
    if (!profile) {
      throw new ValidationError('b2b_profile_required', 'Сначала заполните профиль компании');
    }
    if (dto.fulfillmentType === 'delivery' && !dto.deliveryAddress?.trim()) {
      throw new ValidationError('delivery_address_required', 'Укажите адрес доставки');
    }
    if (dto.fulfillmentType === 'pickup' && !dto.pickupPoint?.trim()) {
      throw new ValidationError('pickup_point_required', 'Выберите точку самовывоза');
    }

    const skus = [...new Set(dto.items.map((item) => item.sku.trim()))];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus }, archived: false },
    });
    const bySku = new Map(products.map((product) => [product.sku, product]));
    const missing = skus.filter((sku) => !bySku.has(sku));
    if (missing.length) {
      throw new ValidationError('b2b_product_not_found', `Товар не найден: ${missing.join(', ')}`);
    }

    const items = dto.items.map((item) => {
      const product = bySku.get(item.sku.trim())!;
      return {
        sku: product.sku,
        name: product.name,
        qty: item.qty,
        listPrice: product.price,
        targetPrice: item.targetPrice ?? null,
      };
    });
    const listTotal = items.reduce((sum, item) => sum + item.listPrice * item.qty, 0);

    return this.audit.transaction(async (tx) => {
      const quote = await tx.b2BQuote.create({
        data: {
          customerId,
          paymentIntent: dto.paymentIntent,
          fulfillmentType: dto.fulfillmentType,
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          pickupPoint: dto.pickupPoint?.trim() || null,
          comment: dto.comment?.trim() || null,
          listTotal,
          items: { create: items },
        },
        include: { items: true },
      });
      return {
        result: quote,
        events: [
          {
            type: EventType.B2BQuoteRequested,
            actor: customerId,
            payload: {
              quoteId: quote.id,
              companyName: profile.companyName,
              paymentIntent: quote.paymentIntent,
              fulfillmentType: quote.fulfillmentType,
              listTotal,
              lineCount: items.length,
            },
            refs: [quote.id, customerId, ...items.map((item) => item.sku)],
          },
        ],
      };
    });
  }

  async update(id: string, dto: UpdateB2BQuoteDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const quote = await tx.b2BQuote.findUnique({ where: { id } });
      if (!quote) throw new ValidationError('b2b_quote_not_found', `Заявка ${id} не найдена`);
      const to = dto.status as B2BQuoteStatus;
      if (!STAFF_TRANSITIONS[quote.status].includes(to)) {
        throw new ConflictError('b2b_illegal_transition', `${quote.status} → ${to} запрещён`);
      }
      if (to === 'quoted' && dto.quotedTotal === undefined) {
        throw new ValidationError('quoted_total_required', 'Для КП укажите итоговую сумму');
      }
      const updated = await tx.b2BQuote.update({
        where: { id },
        data: {
          status: to,
          quotedTotal: dto.quotedTotal,
          staffNote: dto.staffNote?.trim() || undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        },
        include: { items: true },
      });
      return {
        result: updated,
        events: [this.updatedEvent(updated.id, quote.customerId, quote.status, to, actor)],
      };
    });
  }

  async accept(id: string, customerId: string) {
    return this.audit.transaction(async (tx) => {
      const quote = await tx.b2BQuote.findUnique({ where: { id } });
      if (!quote) throw new ValidationError('b2b_quote_not_found', `Заявка ${id} не найдена`);
      if (quote.customerId !== customerId) {
        throw new ForbiddenError('b2b_quote_owner_mismatch', 'Нельзя принять чужое предложение');
      }
      if (quote.status !== 'quoted') {
        throw new ConflictError('b2b_illegal_transition', `${quote.status} → accepted запрещён`);
      }
      const updated = await tx.b2BQuote.update({
        where: { id },
        data: { status: 'accepted' },
        include: { items: true },
      });
      return {
        result: updated,
        events: [this.updatedEvent(id, customerId, quote.status, 'accepted', customerId)],
      };
    });
  }

  private updatedEvent(
    quoteId: string,
    customerId: string,
    from: B2BQuoteStatus,
    to: B2BQuoteStatus,
    actor: string,
  ) {
    return {
      type: EventType.B2BQuoteUpdated,
      actor,
      payload: { quoteId, from, to },
      refs: [quoteId, customerId],
    };
  }

  private async assertCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
    }
  }
}
