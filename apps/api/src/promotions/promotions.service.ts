import { Injectable } from '@nestjs/common';
import { Prisma, PromotionCode, PromotionDiscountType } from '@prisma/client';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto, PromotionQuoteDto, UpdatePromotionDto } from './promotions.dto';

export interface PromotionLine {
  productId: string;
  sku: string;
  category: string;
  price: number;
  qty: number;
}

export interface AppliedPromotion {
  id: string;
  code: string;
  name: string;
  discount: number;
  eligibleSubtotal: number;
}

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list() {
    const now = new Date();
    const rows = await this.prisma.promotionCode.findMany({
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({ ...row, effectiveStatus: this.effectiveStatus(row, now), redemptionCount: row._count.redemptions, _count: undefined }));
  }

  async create(dto: CreatePromotionDto, actor: string) {
    const data = await this.validatedData(dto);
    try {
      return await this.audit.transaction(async (tx) => {
        const promotion = await tx.promotionCode.create({ data: { ...data, createdBy: actor, updatedBy: actor } });
        return { result: this.view(promotion), events: [this.event(EventType.PromotionCreated, actor, promotion)] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('promotion_code_exists', 'Промокод с таким кодом уже существует');
      throw error;
    }
  }

  async update(id: string, dto: UpdatePromotionDto, actor: string) {
    const current = await this.requirePromotion(id);
    if (current.status === 'active' && this.effectiveStatus(current, new Date()) !== 'expired') {
      throw new ConflictError('promotion_active_edit_forbidden', 'Сначала приостановите активный промокод');
    }
    const merged: CreatePromotionDto = {
      code: dto.code ?? current.code,
      name: dto.name ?? current.name,
      description: dto.description === undefined ? current.description ?? undefined : dto.description,
      discountType: dto.discountType ?? current.discountType,
      discountValue: dto.discountValue ?? current.discountValue,
      maxDiscount: dto.maxDiscount === undefined ? current.maxDiscount ?? undefined : dto.maxDiscount,
      minimumSubtotal: dto.minimumSubtotal ?? current.minimumSubtotal,
      eligibleProductIds: dto.eligibleProductIds ?? current.eligibleProductIds,
      eligibleCategories: dto.eligibleCategories ?? current.eligibleCategories,
      startsAt: dto.startsAt === undefined ? current.startsAt?.toISOString() : dto.startsAt,
      endsAt: dto.endsAt === undefined ? current.endsAt?.toISOString() : dto.endsAt,
      totalLimit: dto.totalLimit === undefined ? current.totalLimit ?? undefined : dto.totalLimit,
      perCustomerLimit: dto.perCustomerLimit === undefined ? current.perCustomerLimit ?? undefined : dto.perCustomerLimit,
    };
    const data = await this.validatedData(merged);
    try {
      return await this.audit.transaction(async (tx) => {
        const promotion = await tx.promotionCode.update({ where: { id }, data: { ...data, status: 'draft', updatedBy: actor } });
        return { result: this.view(promotion), events: [this.event(EventType.PromotionUpdated, actor, promotion)] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('promotion_code_exists', 'Промокод с таким кодом уже существует');
      throw error;
    }
  }

  activate(id: string, actor: string) { return this.changeStatus(id, 'active', actor, EventType.PromotionActivated); }
  pause(id: string, actor: string) { return this.changeStatus(id, 'paused', actor, EventType.PromotionPaused); }

  async quote(dto: PromotionQuoteDto, customerId?: string) {
    const lines = await this.resolveLines(dto.items);
    const promotion = await this.prisma.promotionCode.findUnique({ where: { code: normalizeCode(dto.code) } });
    if (!promotion) throw new ValidationError('promo_not_found', 'Промокод не найден');
    const applied = await this.evaluate(this.prisma, promotion, lines, customerId, new Date());
    return {
      ...applied,
      subtotal: lines.reduce((sum, line) => sum + line.price * line.qty, 0),
      customerLimitVerified: Boolean(customerId),
      validUntil: promotion.endsAt,
    };
  }

  async evaluateForOrderOnTx(
    tx: Prisma.TransactionClient,
    input: { code: string; customerId: string; lines: PromotionLine[] },
  ): Promise<AppliedPromotion> {
    const code = normalizeCode(input.code);
    await tx.$queryRaw`SELECT id FROM "PromotionCode" WHERE code = ${code} FOR UPDATE`;
    const promotion = await tx.promotionCode.findUnique({ where: { code } });
    if (!promotion) throw new ValidationError('promo_not_found', 'Промокод не найден');
    return this.evaluate(tx, promotion, input.lines, input.customerId, new Date());
  }

  async registerRedemptionOnTx(
    tx: Prisma.TransactionClient,
    applied: AppliedPromotion,
    customerId: string,
    orderId: string,
    actor: string,
    events: AuditInput[],
  ) {
    const redemption = await tx.promotionRedemption.create({
      data: { promotionId: applied.id, customerId, orderId, discountAmount: applied.discount },
    });
    events.push({
      type: EventType.PromotionRedeemed,
      actor,
      payload: { promotionId: applied.id, code: applied.code, orderId, customerId, discountAmount: applied.discount },
      refs: [applied.id, redemption.id, orderId, customerId],
    });
  }

  private async evaluate(
    db: Pick<Prisma.TransactionClient, 'promotionRedemption'>,
    promotion: PromotionCode,
    lines: PromotionLine[],
    customerId: string | undefined,
    now: Date,
  ): Promise<AppliedPromotion> {
    const status = this.effectiveStatus(promotion, now);
    if (status !== 'active') throw new ValidationError(status === 'expired' ? 'promo_expired' : 'promo_not_active', 'Промокод сейчас не действует');
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
    if (subtotal < promotion.minimumSubtotal) {
      throw new ValidationError('promo_minimum_not_met', `Минимальная сумма заказа: ${promotion.minimumSubtotal} с`);
    }
    const eligible = lines.filter((line) => this.isEligible(promotion, line));
    const eligibleSubtotal = eligible.reduce((sum, line) => sum + line.price * line.qty, 0);
    if (eligibleSubtotal <= 0) throw new ValidationError('promo_items_not_eligible', 'Промокод не действует на товары в корзине');
    const totalUsed = await db.promotionRedemption.count({ where: { promotionId: promotion.id } });
    if (promotion.totalLimit !== null && totalUsed >= promotion.totalLimit) {
      throw new ConflictError('promo_total_limit_reached', 'Лимит использований промокода исчерпан');
    }
    if (customerId && promotion.perCustomerLimit !== null) {
      const customerUsed = await db.promotionRedemption.count({ where: { promotionId: promotion.id, customerId } });
      if (customerUsed >= promotion.perCustomerLimit) throw new ConflictError('promo_customer_limit_reached', 'Вы уже использовали этот промокод');
    }
    let discount = promotion.discountType === 'fixed'
      ? promotion.discountValue
      : Math.floor(eligibleSubtotal * promotion.discountValue / 100);
    if (promotion.maxDiscount !== null) discount = Math.min(discount, promotion.maxDiscount);
    discount = Math.min(discount, eligibleSubtotal);
    if (discount <= 0) throw new ValidationError('promo_zero_discount', 'Промокод не даёт скидку для этой корзины');
    return { id: promotion.id, code: promotion.code, name: promotion.name, discount, eligibleSubtotal };
  }

  private isEligible(promotion: PromotionCode, line: PromotionLine) {
    if (promotion.eligibleProductIds.length === 0 && promotion.eligibleCategories.length === 0) return true;
    return promotion.eligibleProductIds.includes(line.productId)
      || promotion.eligibleCategories.includes(line.category.trim().toLowerCase());
  }

  private async resolveLines(input: PromotionQuoteDto['items']): Promise<PromotionLine[]> {
    const quantities = new Map<string, number>();
    for (const item of input) quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + item.qty);
    const products = await this.prisma.product.findMany({
      where: { sku: { in: [...quantities.keys()] }, archived: false },
      select: { id: true, sku: true, category: true, price: true },
    });
    if (products.length !== quantities.size) throw new ValidationError('promo_product_not_found', 'Один из товаров больше недоступен');
    return products.map((product) => ({
      productId: product.id,
      sku: product.sku,
      category: product.category.trim().toLowerCase(),
      price: product.price,
      qty: quantities.get(product.sku)!,
    }));
  }

  private async validatedData(dto: CreatePromotionDto) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) throw new ValidationError('promotion_window_invalid', 'Окончание должно быть позже начала');
    if (dto.discountType === 'percent' && dto.discountValue > 100) throw new ValidationError('promotion_percent_invalid', 'Процент скидки не может превышать 100');
    const eligibleProductIds = dto.eligibleProductIds ?? [];
    if (eligibleProductIds.length > 0) {
      const count = await this.prisma.product.count({ where: { id: { in: eligibleProductIds }, archived: false } });
      if (count !== eligibleProductIds.length) throw new ValidationError('promotion_product_invalid', 'Выбран несуществующий или архивный товар');
    }
    return {
      code: normalizeCode(dto.code), name: dto.name.trim(), description: dto.description?.trim() || null,
      discountType: dto.discountType, discountValue: dto.discountValue, maxDiscount: dto.maxDiscount ?? null,
      minimumSubtotal: dto.minimumSubtotal ?? 0, eligibleProductIds,
      eligibleCategories: (dto.eligibleCategories ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
      startsAt, endsAt, totalLimit: dto.totalLimit ?? null, perCustomerLimit: dto.perCustomerLimit ?? null,
    };
  }

  private async changeStatus(id: string, status: 'active' | 'paused', actor: string, eventType: string) {
    const current = await this.requirePromotion(id);
    const now = new Date();
    if (status === 'active' && current.endsAt && current.endsAt <= now) throw new ConflictError('promotion_expired', 'Срок промокода уже истёк');
    if (current.status === status) return this.view(current);
    return this.audit.transaction(async (tx) => {
      const promotion = await tx.promotionCode.update({ where: { id }, data: { status, updatedBy: actor } });
      return { result: this.view(promotion), events: [this.event(eventType, actor, promotion)] };
    });
  }

  private requirePromotion(id: string) {
    return this.prisma.promotionCode.findUnique({ where: { id } }).then((row) => {
      if (!row) throw new ValidationError('promotion_not_found', 'Промокод не найден');
      return row;
    });
  }

  private effectiveStatus(promotion: PromotionCode, now: Date): 'draft' | 'active' | 'paused' | 'expired' | 'scheduled' {
    if (promotion.endsAt && promotion.endsAt <= now) return 'expired';
    if (promotion.status === 'active' && promotion.startsAt && promotion.startsAt > now) return 'scheduled';
    return promotion.status;
  }

  private view(promotion: PromotionCode) { return { ...promotion, effectiveStatus: this.effectiveStatus(promotion, new Date()) }; }
  private event(type: string, actor: string, promotion: PromotionCode): AuditInput {
    return { type, actor, payload: { promotionId: promotion.id, code: promotion.code, status: promotion.status }, refs: [promotion.id] };
  }
}

function normalizeCode(value: string) { return value.trim().toUpperCase(); }
function isUniqueViolation(error: unknown): error is { code: 'P2002' } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
