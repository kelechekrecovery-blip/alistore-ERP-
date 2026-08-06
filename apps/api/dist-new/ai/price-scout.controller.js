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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceScoutController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const ai_read_decorator_1 = require("./ai-read.decorator");
const price_scout_dto_1 = require("./price-scout.dto");
const price_scout_service_1 = require("./price-scout.service");
let PriceScoutController = class PriceScoutController {
    constructor(priceScout) {
        this.priceScout = priceScout;
    }
    scout(dto) {
        return this.priceScout.scout(dto);
    }
};
exports.PriceScoutController = PriceScoutController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Разведка рыночной цены — keyless listings rules или LLM scout при ключе' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ source, marketLow, marketMedian, marketHigh, recommendedPrice, confidence }.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown SKU or missing name/basePrice.' }),
    (0, common_1.Post)('price-scout'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [price_scout_dto_1.PriceScoutDto]),
    __metadata("design:returntype", void 0)
], PriceScoutController.prototype, "scout", null);
exports.PriceScoutController = PriceScoutController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [price_scout_service_1.PriceScoutService])
], PriceScoutController);
//# sourceMappingURL=price-scout.controller.js.map