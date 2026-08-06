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
exports.PromotionsService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const prisma_errors_1 = require("../common/prisma-errors");
let PromotionsService = class PromotionsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async list() {
        const now = new Date();
        const rows = await this.prisma.promotionCode.findMany({
            include: { _count: { select: { redemptions: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => ({ ...row, effectiveStatus: this.effectiveStatus(row, now), redemptionCount: row._count.redemptions, _count: undefined }));
    }
    async create(dto, actor) {
        const data = await this.validatedData(dto);
        try {
            return await this.audit.transaction(async (tx) => {
                const promotion = await tx.promotionCode.create({ data: { ...data, createdBy: actor, updatedBy: actor } });
                return { result: this.view(promotion), events: [this.event(event_types_1.EventType.PromotionCreated, actor, promotion)] };
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw new errors_1.ConflictError('promotion_code_exists', 'Промокод с таким кодом уже существует');
            throw error;
        }
    }
    async update(id, dto, actor) {
        const current = await this.requirePromotion(id);
        if (current.status === 'active' && this.effectiveStatus(current, new Date()) !== 'expired') {
            throw new errors_1.ConflictError('promotion_active_edit_forbidden', 'Сначала приостановите активный промокод');
        }
        const merged = {
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
                return { result: this.view(promotion), events: [this.event(event_types_1.EventType.PromotionUpdated, actor, promotion)] };
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw new errors_1.ConflictError('promotion_code_exists', 'Промокод с таким кодом уже существует');
            throw error;
        }
    }
    activate(id, actor) { return this.changeStatus(id, 'active', actor, event_types_1.EventType.PromotionActivated); }
    pause(id, actor) { return this.changeStatus(id, 'paused', actor, event_types_1.EventType.PromotionPaused); }
    async quote(dto, customerId) {
        const lines = await this.resolveLines(dto.items);
        const promotion = await this.prisma.promotionCode.findUnique({ where: { code: normalizeCode(dto.code) } });
        if (!promotion)
            throw new errors_1.ValidationError('promo_not_found', 'Промокод не найден');
        const applied = await this.evaluate(this.prisma, promotion, lines, customerId, new Date());
        return {
            ...applied,
            subtotal: lines.reduce((sum, line) => sum + line.price * line.qty, 0),
            customerLimitVerified: Boolean(customerId),
            validUntil: promotion.endsAt,
        };
    }
    async evaluateForOrderOnTx(tx, input) {
        const code = normalizeCode(input.code);
        await tx.$queryRaw `SELECT id FROM "PromotionCode" WHERE code = ${code} FOR UPDATE`;
        const promotion = await tx.promotionCode.findUnique({ where: { code } });
        if (!promotion)
            throw new errors_1.ValidationError('promo_not_found', 'Промокод не найден');
        return this.evaluate(tx, promotion, input.lines, input.customerId, new Date());
    }
    async registerRedemptionOnTx(tx, applied, customerId, orderId, actor, events) {
        const redemption = await tx.promotionRedemption.create({
            data: { promotionId: applied.id, customerId, orderId, discountAmount: applied.discount },
        });
        events.push({
            type: event_types_1.EventType.PromotionRedeemed,
            actor,
            payload: { promotionId: applied.id, code: applied.code, orderId, customerId, discountAmount: applied.discount },
            refs: [applied.id, redemption.id, orderId, customerId],
        });
    }
    async evaluate(db, promotion, lines, customerId, now) {
        const status = this.effectiveStatus(promotion, now);
        if (status !== 'active')
            throw new errors_1.ValidationError(status === 'expired' ? 'promo_expired' : 'promo_not_active', 'Промокод сейчас не действует');
        const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
        if (subtotal < promotion.minimumSubtotal) {
            throw new errors_1.ValidationError('promo_minimum_not_met', `Минимальная сумма заказа: ${promotion.minimumSubtotal} с`);
        }
        const eligible = lines.filter((line) => this.isEligible(promotion, line));
        const eligibleSubtotal = eligible.reduce((sum, line) => sum + line.price * line.qty, 0);
        if (eligibleSubtotal <= 0)
            throw new errors_1.ValidationError('promo_items_not_eligible', 'Промокод не действует на товары в корзине');
        const totalUsed = await db.promotionRedemption.count({ where: { promotionId: promotion.id } });
        if (promotion.totalLimit !== null && totalUsed >= promotion.totalLimit) {
            throw new errors_1.ConflictError('promo_total_limit_reached', 'Лимит использований промокода исчерпан');
        }
        if (customerId && promotion.perCustomerLimit !== null) {
            const customerUsed = await db.promotionRedemption.count({ where: { promotionId: promotion.id, customerId } });
            if (customerUsed >= promotion.perCustomerLimit)
                throw new errors_1.ConflictError('promo_customer_limit_reached', 'Вы уже использовали этот промокод');
        }
        let discount = promotion.discountType === 'fixed'
            ? promotion.discountValue
            : Math.floor(eligibleSubtotal * promotion.discountValue / 100);
        if (promotion.maxDiscount !== null)
            discount = Math.min(discount, promotion.maxDiscount);
        discount = Math.min(discount, eligibleSubtotal);
        if (discount <= 0)
            throw new errors_1.ValidationError('promo_zero_discount', 'Промокод не даёт скидку для этой корзины');
        return { id: promotion.id, code: promotion.code, name: promotion.name, discount, eligibleSubtotal };
    }
    isEligible(promotion, line) {
        if (promotion.eligibleProductIds.length === 0 && promotion.eligibleCategories.length === 0)
            return true;
        return promotion.eligibleProductIds.includes(line.productId)
            || promotion.eligibleCategories.includes(line.category.trim().toLowerCase());
    }
    async resolveLines(input) {
        const quantities = new Map();
        for (const item of input)
            quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + item.qty);
        const products = await this.prisma.product.findMany({
            where: { sku: { in: [...quantities.keys()] }, archived: false },
            select: { id: true, sku: true, category: true, price: true },
        });
        if (products.length !== quantities.size)
            throw new errors_1.ValidationError('promo_product_not_found', 'Один из товаров больше недоступен');
        return products.map((product) => ({
            productId: product.id,
            sku: product.sku,
            category: product.category.trim().toLowerCase(),
            price: product.price,
            qty: quantities.get(product.sku),
        }));
    }
    async validatedData(dto) {
        const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
        const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
        if (startsAt && endsAt && endsAt <= startsAt)
            throw new errors_1.ValidationError('promotion_window_invalid', 'Окончание должно быть позже начала');
        if (dto.discountType === 'percent' && dto.discountValue > 100)
            throw new errors_1.ValidationError('promotion_percent_invalid', 'Процент скидки не может превышать 100');
        const eligibleProductIds = dto.eligibleProductIds ?? [];
        if (eligibleProductIds.length > 0) {
            const count = await this.prisma.product.count({ where: { id: { in: eligibleProductIds }, archived: false } });
            if (count !== eligibleProductIds.length)
                throw new errors_1.ValidationError('promotion_product_invalid', 'Выбран несуществующий или архивный товар');
        }
        return {
            code: normalizeCode(dto.code), name: dto.name.trim(), description: dto.description?.trim() || null,
            discountType: dto.discountType, discountValue: dto.discountValue, maxDiscount: dto.maxDiscount ?? null,
            minimumSubtotal: dto.minimumSubtotal ?? 0, eligibleProductIds,
            eligibleCategories: (dto.eligibleCategories ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
            startsAt, endsAt, totalLimit: dto.totalLimit ?? null, perCustomerLimit: dto.perCustomerLimit ?? null,
        };
    }
    async changeStatus(id, status, actor, eventType) {
        const current = await this.requirePromotion(id);
        const now = new Date();
        if (status === 'active' && current.endsAt && current.endsAt <= now)
            throw new errors_1.ConflictError('promotion_expired', 'Срок промокода уже истёк');
        if (current.status === status)
            return this.view(current);
        return this.audit.transaction(async (tx) => {
            const promotion = await tx.promotionCode.update({ where: { id }, data: { status, updatedBy: actor } });
            return { result: this.view(promotion), events: [this.event(eventType, actor, promotion)] };
        });
    }
    requirePromotion(id) {
        return this.prisma.promotionCode.findUnique({ where: { id } }).then((row) => {
            if (!row)
                throw new errors_1.ValidationError('promotion_not_found', 'Промокод не найден');
            return row;
        });
    }
    effectiveStatus(promotion, now) {
        if (promotion.endsAt && promotion.endsAt <= now)
            return 'expired';
        if (promotion.status === 'active' && promotion.startsAt && promotion.startsAt > now)
            return 'scheduled';
        return promotion.status;
    }
    view(promotion) { return { ...promotion, effectiveStatus: this.effectiveStatus(promotion, new Date()) }; }
    event(type, actor, promotion) {
        return { type, actor, payload: { promotionId: promotion.id, code: promotion.code, status: promotion.status }, refs: [promotion.id] };
    }
};
exports.PromotionsService = PromotionsService;
exports.PromotionsService = PromotionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], PromotionsService);
function normalizeCode(value) { return value.trim().toUpperCase(); }
function isUniqueViolation(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
//# sourceMappingURL=promotions.service.js.map