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
var PriceScoutService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceScoutService = void 0;
const common_1 = require("@nestjs/common");
const errors_1 = require("../common/errors");
const prisma_service_1 = require("../prisma/prisma.service");
const llm_factory_1 = require("./llm/llm.factory");
const price_scout_1 = require("./price-scout");
let PriceScoutService = PriceScoutService_1 = class PriceScoutService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PriceScoutService_1.name);
    }
    async scout(dto) {
        const input = await this.resolve(dto);
        const fallback = (0, price_scout_1.scoutPriceByRules)(input);
        const client = (0, llm_factory_1.resolveLlmClient)();
        if (!client)
            return fallback;
        try {
            const [system, user] = (0, price_scout_1.buildPriceScoutMessages)(input);
            const res = await client.chat([{ role: 'user', content: user.content }], {
                system: system.content,
                cacheSystem: true,
                jsonSchema: price_scout_1.PRICE_SCOUT_SCHEMA,
                maxTokens: 700,
            });
            return { source: res.source, ...(0, price_scout_1.parsePriceScoutResponse)(res.text) };
        }
        catch (err) {
            this.logger.warn(`AI price scout failed, using rule fallback: ${String(err)}`);
            return { ...fallback, source: `${fallback.source} (fallback)` };
        }
    }
    async resolve(dto) {
        if (dto.sku) {
            const product = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
            if (!product)
                throw new errors_1.ValidationError('product_not_found', `SKU ${dto.sku} не найден`);
            return {
                sku: product.sku,
                name: product.name,
                category: product.category,
                basePrice: product.price,
                observedListings: dto.observedListings ?? [],
            };
        }
        if (!dto.name)
            throw new errors_1.ValidationError('name_required', 'Укажите sku или name');
        if (!dto.basePrice || dto.basePrice <= 0) {
            throw new errors_1.ValidationError('base_price_required', 'Укажите basePrice или существующий sku');
        }
        return {
            name: dto.name,
            category: dto.category,
            basePrice: dto.basePrice,
            observedListings: dto.observedListings ?? [],
        };
    }
};
exports.PriceScoutService = PriceScoutService;
exports.PriceScoutService = PriceScoutService = PriceScoutService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PriceScoutService);
//# sourceMappingURL=price-scout.service.js.map