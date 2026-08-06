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
exports.PricingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const pricing_1 = require("./pricing");
let PricingService = class PricingService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async review() {
        const products = await this.prisma.product.findMany({
            where: { archived: false },
            select: { sku: true, name: true, price: true, category: true, id: true },
        });
        const grouped = await this.prisma.deviceUnit.groupBy({
            by: ['productId', 'status'],
            _count: { _all: true },
        });
        const counts = new Map();
        for (const row of grouped) {
            const cur = counts.get(row.productId) ?? { inStock: 0, soldUnits: 0 };
            if (row.status === 'in_stock')
                cur.inStock += row._count._all;
            else if (row.status === 'sold')
                cur.soldUnits += row._count._all;
            counts.set(row.productId, cur);
        }
        const reviews = products.map((p) => {
            const c = counts.get(p.id) ?? { inStock: 0, soldUnits: 0 };
            const rec = (0, pricing_1.suggestPrice)({ basePrice: p.price, inStock: c.inStock, soldUnits: c.soldUnits });
            return { sku: p.sku, name: p.name, category: p.category, inStock: c.inStock, soldUnits: c.soldUnits, ...rec };
        });
        reviews.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
        const actionable = reviews.filter((r) => r.action !== 'hold').length;
        return { source: 'rules', generatedForCount: reviews.length, actionable, reviews };
    }
};
exports.PricingService = PricingService;
exports.PricingService = PricingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PricingService);
//# sourceMappingURL=pricing.service.js.map