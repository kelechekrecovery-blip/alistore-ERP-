"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerAlertsModule = void 0;
const common_1 = require("@nestjs/common");
const owner_alerts_service_1 = require("./owner-alerts.service");
const owner_alerts_scheduler_1 = require("./owner-alerts.scheduler");
const observability_module_1 = require("../observability/observability.module");
let OwnerAlertsModule = class OwnerAlertsModule {
};
exports.OwnerAlertsModule = OwnerAlertsModule;
exports.OwnerAlertsModule = OwnerAlertsModule = __decorate([
    (0, common_1.Module)({
        imports: [observability_module_1.ObservabilityModule],
        providers: [owner_alerts_service_1.OwnerAlertsService, owner_alerts_scheduler_1.OwnerAlertsScheduler],
        exports: [owner_alerts_service_1.OwnerAlertsService],
    })
], OwnerAlertsModule);
//# sourceMappingURL=owner-alerts.module.js.map