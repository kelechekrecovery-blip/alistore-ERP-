"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebtsModule = void 0;
const common_1 = require("@nestjs/common");
const settings_module_1 = require("../settings/settings.module");
const debts_service_1 = require("./debts.service");
const debts_controller_1 = require("./debts.controller");
const approvals_module_1 = require("../approvals/approvals.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const outbox_module_1 = require("../outbox/outbox.module");
const debts_scheduler_1 = require("./debts.scheduler");
const observability_module_1 = require("../observability/observability.module");
let DebtsModule = class DebtsModule {
};
exports.DebtsModule = DebtsModule;
exports.DebtsModule = DebtsModule = __decorate([
    (0, common_1.Module)({
        imports: [settings_module_1.SettingsModule, approvals_module_1.ApprovalsModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, outbox_module_1.OutboxModule, observability_module_1.ObservabilityModule],
        providers: [debts_service_1.DebtsService, debts_scheduler_1.DebtsReminderScheduler],
        controllers: [debts_controller_1.DebtsController],
        exports: [debts_service_1.DebtsService],
    })
], DebtsModule);
//# sourceMappingURL=debts.module.js.map