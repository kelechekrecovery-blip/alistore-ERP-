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
exports.CampaignTrackingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const attribution_dto_1 = require("./attribution.dto");
const campaign_attribution_service_1 = require("./campaign-attribution.service");
let CampaignTrackingController = class CampaignTrackingController {
    constructor(attribution) {
        this.attribution = attribution;
    }
    track(dto) {
        return this.attribution.trackPublic(dto);
    }
};
exports.CampaignTrackingController = CampaignTrackingController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Record a privacy-safe campaign click or storefront visit' }),
    (0, swagger_1.ApiAcceptedResponse)({ description: 'Event accepted; unknown or replayed facts do not create rows.' }),
    (0, common_1.Post)('funnel'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [attribution_dto_1.CampaignFunnelDto]),
    __metadata("design:returntype", void 0)
], CampaignTrackingController.prototype, "track", null);
exports.CampaignTrackingController = CampaignTrackingController = __decorate([
    (0, swagger_1.ApiTags)('campaigns'),
    (0, common_1.Controller)('campaigns'),
    __metadata("design:paramtypes", [campaign_attribution_service_1.CampaignAttributionService])
], CampaignTrackingController);
//# sourceMappingURL=campaign-tracking.controller.js.map