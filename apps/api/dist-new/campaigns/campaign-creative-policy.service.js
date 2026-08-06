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
exports.CampaignCreativePolicyService = void 0;
const common_1 = require("@nestjs/common");
const moderation_service_1 = require("../ai/moderation.service");
const errors_1 = require("../common/errors");
let CampaignCreativePolicyService = class CampaignCreativePolicyService {
    constructor(moderation) {
        this.moderation = moderation;
    }
    async assertAllowed(input) {
        const text = [input.creativeHeadline, input.creativeBody, input.creativeCtaLabel]
            .filter((value) => typeof value === 'string' && value.trim().length > 0)
            .join('\n');
        if (!text)
            return;
        const verdict = await this.moderation.moderate(text);
        if (!verdict.allowed) {
            throw new errors_1.ValidationError('campaign_creative_flagged', verdict.reason || verdict.categories.join(', '));
        }
    }
};
exports.CampaignCreativePolicyService = CampaignCreativePolicyService;
exports.CampaignCreativePolicyService = CampaignCreativePolicyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [moderation_service_1.ModerationService])
], CampaignCreativePolicyService);
//# sourceMappingURL=campaign-creative-policy.service.js.map