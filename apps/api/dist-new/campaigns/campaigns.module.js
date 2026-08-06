"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsModule = void 0;
const common_1 = require("@nestjs/common");
const authz_module_1 = require("../authz/authz.module");
const outbox_module_1 = require("../outbox/outbox.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const campaigns_controller_1 = require("./campaigns.controller");
const campaigns_service_1 = require("./campaigns.service");
const campaign_attribution_service_1 = require("./campaign-attribution.service");
const campaign_tracking_controller_1 = require("./campaign-tracking.controller");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const moderation_module_1 = require("../ai/moderation.module");
const campaign_creative_policy_service_1 = require("./campaign-creative-policy.service");
let CampaignsModule = class CampaignsModule {
};
exports.CampaignsModule = CampaignsModule;
exports.CampaignsModule = CampaignsModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, outbox_module_1.OutboxModule, rate_limit_module_1.RateLimitModule, moderation_module_1.ModerationModule],
        controllers: [campaigns_controller_1.CampaignsController, campaign_tracking_controller_1.CampaignTrackingController],
        providers: [campaigns_service_1.CampaignsService, campaign_attribution_service_1.CampaignAttributionService, campaign_creative_policy_service_1.CampaignCreativePolicyService],
        exports: [campaigns_service_1.CampaignsService, campaign_attribution_service_1.CampaignAttributionService],
    })
], CampaignsModule);
//# sourceMappingURL=campaigns.module.js.map