"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceCenterModule = void 0;
const common_1 = require("@nestjs/common");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const service_center_controller_1 = require("./service-center.controller");
const service_center_service_1 = require("./service-center.service");
const service_execution_service_1 = require("./service-execution.service");
const service_sla_scheduler_1 = require("./service-sla.scheduler");
const service_sla_service_1 = require("./service-sla.service");
const service_loaner_service_1 = require("./service-loaner.service");
const outbox_module_1 = require("../outbox/outbox.module");
const observability_module_1 = require("../observability/observability.module");
let ServiceCenterModule = class ServiceCenterModule {
};
exports.ServiceCenterModule = ServiceCenterModule;
exports.ServiceCenterModule = ServiceCenterModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, outbox_module_1.OutboxModule, observability_module_1.ObservabilityModule],
        controllers: [service_center_controller_1.ServiceCenterController],
        providers: [service_center_service_1.ServiceCenterService, service_execution_service_1.ServiceExecutionService, service_loaner_service_1.ServiceLoanerService, service_sla_service_1.ServiceSlaService, service_sla_scheduler_1.ServiceSlaScheduler],
        exports: [service_center_service_1.ServiceCenterService, service_execution_service_1.ServiceExecutionService, service_loaner_service_1.ServiceLoanerService, service_sla_service_1.ServiceSlaService],
    })
], ServiceCenterModule);
//# sourceMappingURL=service-center.module.js.map