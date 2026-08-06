"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramAgentModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const authz_module_1 = require("../authz/authz.module");
const approvals_module_1 = require("../approvals/approvals.module");
const outbox_module_1 = require("../outbox/outbox.module");
const reports_module_1 = require("../reports/reports.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const support_module_1 = require("../support/support.module");
const telegram_agent_controller_1 = require("./telegram-agent.controller");
const telegram_agent_retention_service_1 = require("./telegram-agent-retention.service");
const telegram_agent_service_1 = require("./telegram-agent.service");
let TelegramAgentModule = class TelegramAgentModule {
};
exports.TelegramAgentModule = TelegramAgentModule;
exports.TelegramAgentModule = TelegramAgentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            approvals_module_1.ApprovalsModule,
            auth_module_1.AuthModule,
            authz_module_1.AuthzModule,
            outbox_module_1.OutboxModule,
            rate_limit_module_1.RateLimitModule,
            reports_module_1.ReportsModule,
            staff_auth_module_1.StaffAuthModule,
            support_module_1.SupportModule,
        ],
        controllers: [telegram_agent_controller_1.TelegramAgentController],
        providers: [telegram_agent_service_1.TelegramAgentService, telegram_agent_retention_service_1.TelegramAgentRetentionService],
        exports: [telegram_agent_service_1.TelegramAgentService],
    })
], TelegramAgentModule);
//# sourceMappingURL=telegram-agent.module.js.map