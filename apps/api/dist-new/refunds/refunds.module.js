"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundsModule = void 0;
const common_1 = require("@nestjs/common");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const config_1 = require("@nestjs/config");
const authz_module_1 = require("../authz/authz.module");
const observability_module_1 = require("../observability/observability.module");
const payment_gateway_provider_1 = require("../payments/payment-gateway-provider");
const payment_gateway_selector_1 = require("../payments/payment-gateway-selector");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const outbox_module_1 = require("../outbox/outbox.module");
const refunds_controller_1 = require("./refunds.controller");
const refunds_processor_1 = require("./refunds.processor");
const refunds_service_1 = require("./refunds.service");
const refunds_relay_1 = require("./refunds.relay");
const refund_webhooks_controller_1 = require("./refund-webhooks.controller");
let RefundsModule = class RefundsModule {
};
exports.RefundsModule = RefundsModule;
exports.RefundsModule = RefundsModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, observability_module_1.ObservabilityModule, outbox_module_1.OutboxModule, rate_limit_module_1.RateLimitModule],
        providers: [
            refunds_service_1.RefundsService,
            refunds_processor_1.RefundProcessor,
            refunds_relay_1.RefundRelay,
            {
                provide: payment_gateway_provider_1.PAYMENT_GATEWAY_PROVIDER,
                inject: [config_1.ConfigService],
                useFactory: (config) => (0, payment_gateway_selector_1.selectPaymentGatewayProvider)((name) => config.get(name)),
            },
        ],
        controllers: [refunds_controller_1.RefundsController, refund_webhooks_controller_1.RefundWebhooksController],
        exports: [refunds_service_1.RefundsService, refunds_processor_1.RefundProcessor],
    })
], RefundsModule);
//# sourceMappingURL=refunds.module.js.map