"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const alerter_service_1 = require("./alerter.service");
const error_reporter_1 = require("./error-reporter");
const sentry_exception_filter_1 = require("./sentry-exception.filter");
const metrics_controller_1 = require("./metrics.controller");
const metrics_interceptor_1 = require("./metrics.interceptor");
const metrics_service_1 = require("./metrics.service");
const status_controller_1 = require("./status.controller");
let ObservabilityModule = class ObservabilityModule {
};
exports.ObservabilityModule = ObservabilityModule;
exports.ObservabilityModule = ObservabilityModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, authz_module_1.AuthzModule, staff_auth_module_1.StaffAuthModule],
        controllers: [metrics_controller_1.MetricsController, status_controller_1.StatusController],
        providers: [
            error_reporter_1.ErrorReporter,
            alerter_service_1.AlerterService,
            metrics_service_1.MetricsService,
            { provide: core_1.APP_INTERCEPTOR, useClass: metrics_interceptor_1.MetricsInterceptor },
            { provide: core_1.APP_FILTER, useClass: sentry_exception_filter_1.SentryExceptionFilter },
        ],
        exports: [error_reporter_1.ErrorReporter, alerter_service_1.AlerterService, metrics_service_1.MetricsService],
    })
], ObservabilityModule);
//# sourceMappingURL=observability.module.js.map