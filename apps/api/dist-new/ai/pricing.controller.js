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
exports.PricingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ai_read_decorator_1 = require("./ai-read.decorator");
const pricing_service_1 = require("./pricing.service");
let PricingController = class PricingController {
    constructor(pricing) {
        this.pricing = pricing;
    }
    review() {
        return this.pricing.review();
    }
};
exports.PricingController = PricingController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Ценовые рекомендации по спросу/остатку — правила (keyless, read-only)' }),
    (0, swagger_1.ApiOkResponse)({ description: '{ source, generatedForCount, actionable, reviews[] }.' }),
    (0, common_1.Get)('pricing'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "review", null);
exports.PricingController = PricingController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, ai_read_decorator_1.AiReadGuard)(),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [pricing_service_1.PricingService])
], PricingController);
//# sourceMappingURL=pricing.controller.js.map