"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const settings_module_1 = require("../settings/settings.module");
const authz_module_1 = require("../authz/authz.module");
const reports_module_1 = require("../reports/reports.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const insights_service_1 = require("./insights.service");
const insights_controller_1 = require("./insights.controller");
const valuation_service_1 = require("./valuation.service");
const valuation_controller_1 = require("./valuation.controller");
const categorize_controller_1 = require("./categorize.controller");
const categorize_service_1 = require("./categorize.service");
const moderation_module_1 = require("./moderation.module");
const pricing_service_1 = require("./pricing.service");
const pricing_controller_1 = require("./pricing.controller");
const reorder_service_1 = require("./reorder.service");
const reorder_controller_1 = require("./reorder.controller");
const describe_service_1 = require("./describe.service");
const describe_controller_1 = require("./describe.controller");
const grading_service_1 = require("./grading.service");
const grading_controller_1 = require("./grading.controller");
const price_scout_service_1 = require("./price-scout.service");
const price_scout_controller_1 = require("./price-scout.controller");
const orchestrator_service_1 = require("./orchestrator.service");
const orchestrator_controller_1 = require("./orchestrator.controller");
const support_module_1 = require("../support/support.module");
const approvals_module_1 = require("../approvals/approvals.module");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [settings_module_1.SettingsModule, reports_module_1.ReportsModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, moderation_module_1.ModerationModule, support_module_1.SupportModule, approvals_module_1.ApprovalsModule],
        providers: [
            insights_service_1.InsightsService,
            valuation_service_1.ValuationService,
            pricing_service_1.PricingService,
            reorder_service_1.ReorderService,
            describe_service_1.DescribeService,
            grading_service_1.GradingService,
            price_scout_service_1.PriceScoutService,
            categorize_service_1.CategorizeService,
            orchestrator_service_1.AiOrchestratorService,
        ],
        controllers: [
            insights_controller_1.InsightsController,
            valuation_controller_1.ValuationController,
            categorize_controller_1.CategorizeController,
            pricing_controller_1.PricingController,
            reorder_controller_1.ReorderController,
            describe_controller_1.DescribeController,
            grading_controller_1.GradingController,
            price_scout_controller_1.PriceScoutController,
            orchestrator_controller_1.AiOrchestratorController,
        ],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map