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
exports.ValuationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const settings_service_1 = require("../settings/settings.service");
const errors_1 = require("../common/errors");
const valuation_1 = require("./valuation");
let ValuationService = class ValuationService {
    constructor(prisma, settings) {
        this.prisma = prisma;
        this.settings = settings;
    }
    async assess(dto) {
        let basePrice = dto.basePrice ?? 0;
        if (dto.sku) {
            const product = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
            if (!product) {
                throw new errors_1.ValidationError('product_not_found', `SKU ${dto.sku} не найден`);
            }
            basePrice = product.price;
        }
        if (basePrice <= 0) {
            throw new errors_1.ValidationError('base_price_required', 'Укажите basePrice или существующий sku');
        }
        const buybackPct = await this.settings.value('tradein.buyback_of_resale_pct');
        return (0, valuation_1.assessDevice)({
            basePrice,
            grade: dto.grade,
            ageMonths: dto.ageMonths ?? 0,
            defects: dto.defects ?? [],
        }, buybackPct / 100);
    }
};
exports.ValuationService = ValuationService;
exports.ValuationService = ValuationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        settings_service_1.SettingsService])
], ValuationService);
//# sourceMappingURL=valuation.service.js.map