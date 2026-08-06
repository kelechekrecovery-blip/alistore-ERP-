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
exports.B2BService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const STAFF_TRANSITIONS = {
    requested: ['reviewing', 'rejected'],
    reviewing: ['quoted', 'rejected'],
    quoted: ['rejected'],
    accepted: [],
    rejected: [],
};
let B2BService = class B2BService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    profile(customerId) {
        return this.prisma.businessBuyerProfile.findUnique({ where: { customerId } });
    }
    async upsertProfile(customerId, dto) {
        await this.assertCustomer(customerId);
        return this.prisma.businessBuyerProfile.upsert({
            where: { customerId },
            create: { customerId, ...dto },
            update: dto,
        });
    }
    mine(customerId) {
        return this.prisma.b2BQuote.findMany({
            where: { customerId },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async list(status) {
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
    async request(customerId, dto) {
        await this.assertCustomer(customerId);
        const profile = await this.profile(customerId);
        if (!profile) {
            throw new errors_1.ValidationError('b2b_profile_required', 'Сначала заполните профиль компании');
        }
        if (dto.fulfillmentType === 'delivery' && !dto.deliveryAddress?.trim()) {
            throw new errors_1.ValidationError('delivery_address_required', 'Укажите адрес доставки');
        }
        if (dto.fulfillmentType === 'pickup' && !dto.pickupPoint?.trim()) {
            throw new errors_1.ValidationError('pickup_point_required', 'Выберите точку самовывоза');
        }
        const skus = [...new Set(dto.items.map((item) => item.sku.trim()))];
        const products = await this.prisma.product.findMany({
            where: { sku: { in: skus }, archived: false },
        });
        const bySku = new Map(products.map((product) => [product.sku, product]));
        const missing = skus.filter((sku) => !bySku.has(sku));
        if (missing.length) {
            throw new errors_1.ValidationError('b2b_product_not_found', `Товар не найден: ${missing.join(', ')}`);
        }
        const items = dto.items.map((item) => {
            const product = bySku.get(item.sku.trim());
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
                        type: event_types_1.EventType.B2BQuoteRequested,
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
    async update(id, dto, actor) {
        return this.audit.transaction(async (tx) => {
            const quote = await tx.b2BQuote.findUnique({ where: { id } });
            if (!quote)
                throw new errors_1.ValidationError('b2b_quote_not_found', `Заявка ${id} не найдена`);
            const to = dto.status;
            if (!STAFF_TRANSITIONS[quote.status].includes(to)) {
                throw new errors_1.ConflictError('b2b_illegal_transition', `${quote.status} → ${to} запрещён`);
            }
            if (to === 'quoted' && dto.quotedTotal === undefined) {
                throw new errors_1.ValidationError('quoted_total_required', 'Для КП укажите итоговую сумму');
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
    async accept(id, customerId) {
        return this.audit.transaction(async (tx) => {
            const quote = await tx.b2BQuote.findUnique({ where: { id } });
            if (!quote)
                throw new errors_1.ValidationError('b2b_quote_not_found', `Заявка ${id} не найдена`);
            if (quote.customerId !== customerId) {
                throw new errors_1.ForbiddenError('b2b_quote_owner_mismatch', 'Нельзя принять чужое предложение');
            }
            if (quote.status !== 'quoted') {
                throw new errors_1.ConflictError('b2b_illegal_transition', `${quote.status} → accepted запрещён`);
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
    updatedEvent(quoteId, customerId, from, to, actor) {
        return {
            type: event_types_1.EventType.B2BQuoteUpdated,
            actor,
            payload: { quoteId, from, to },
            refs: [quoteId, customerId],
        };
    }
    async assertCustomer(customerId) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', `Клиент ${customerId} не найден`);
        }
    }
};
exports.B2BService = B2BService;
exports.B2BService = B2BService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], B2BService);
//# sourceMappingURL=b2b.service.js.map