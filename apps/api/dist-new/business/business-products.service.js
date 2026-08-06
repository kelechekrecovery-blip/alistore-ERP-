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
exports.BusinessProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const event_types_1 = require("../audit/event-types");
const errors_1 = require("../common/errors");
const PARTNER_FIELDS = {
    id: true, sku: true, name: true, price: true, category: true, archived: true,
};
let BusinessProductsService = class BusinessProductsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    actorOf(principal, sellerId) {
        const userId = principal.customerId;
        return userId ? `seller:${sellerId}:user:${userId}` : `seller:${sellerId}`;
    }
    scopeOf(principal) {
        if (principal.typ !== 'seller') {
            throw new common_1.ForbiddenException('Кабинет доступен только магазину-партнёру');
        }
        const sellerId = principal.sellerId;
        if (!sellerId)
            throw new common_1.ForbiddenException('Токен без магазина');
        return sellerId;
    }
    async list(principal) {
        const sellerId = this.scopeOf(principal);
        const rows = await this.prisma.product.findMany({
            where: { sellerId },
            orderBy: [{ archived: 'asc' }, { name: 'asc' }],
            select: PARTNER_FIELDS,
        });
        return rows;
    }
    async updatePrice(principal, productId, price) {
        const sellerId = this.scopeOf(principal);
        if (!Number.isInteger(price) || price < 1) {
            throw new errors_1.ValidationError('price_invalid', 'Цена должна быть целым числом от 1 сома');
        }
        return this.audit.transaction(async (tx) => {
            const product = await tx.product.findFirst({ where: { id: productId, sellerId } });
            if (!product)
                throw new common_1.NotFoundException(`Товар ${productId} не найден`);
            const updated = await tx.product.update({
                where: { id: productId, sellerId },
                data: { price },
                select: PARTNER_FIELDS,
            });
            return {
                result: updated,
                events: [
                    {
                        type: event_types_1.EventType.PriceChanged,
                        actor: this.actorOf(principal, sellerId),
                        refs: [productId, sellerId],
                        payload: { productId, sellerId, previousPrice: product.price, price },
                    },
                ],
            };
        });
    }
};
exports.BusinessProductsService = BusinessProductsService;
exports.BusinessProductsService = BusinessProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], BusinessProductsService);
//# sourceMappingURL=business-products.service.js.map