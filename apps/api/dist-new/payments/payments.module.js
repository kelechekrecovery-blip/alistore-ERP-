"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsModule = void 0;
const common_1 = require("@nestjs/common");
const payments_service_1 = require("./payments.service");
const payments_controller_1 = require("./payments.controller");
const units_module_1 = require("../units/units.module");
const approvals_module_1 = require("../approvals/approvals.module");
const orders_module_1 = require("../orders/orders.module");
const payment_intents_service_1 = require("./payment-intents.service");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const giftcards_module_1 = require("../giftcards/giftcards.module");
const config_1 = require("@nestjs/config");
const payment_gateway_provider_1 = require("./payment-gateway-provider");
const payment_gateway_selector_1 = require("./payment-gateway-selector");
const sandbox_payments_controller_1 = require("./sandbox-payments.controller");
const campaigns_module_1 = require("../campaigns/campaigns.module");
const refunds_module_1 = require("../refunds/refunds.module");
const outbox_module_1 = require("../outbox/outbox.module");
let PaymentsModule = class PaymentsModule {
};
exports.PaymentsModule = PaymentsModule;
exports.PaymentsModule = PaymentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            units_module_1.UnitsModule,
            approvals_module_1.ApprovalsModule,
            orders_module_1.OrdersModule,
            staff_auth_module_1.StaffAuthModule,
            authz_module_1.AuthzModule,
            rate_limit_module_1.RateLimitModule,
            giftcards_module_1.GiftcardsModule,
            campaigns_module_1.CampaignsModule,
            refunds_module_1.RefundsModule,
            outbox_module_1.OutboxModule,
        ],
        providers: [
            payments_service_1.PaymentsService,
            payment_intents_service_1.PaymentIntentsService,
            {
                provide: payment_gateway_provider_1.PAYMENT_GATEWAY_PROVIDER,
                inject: [config_1.ConfigService],
                useFactory: (config) => (0, payment_gateway_selector_1.selectPaymentGatewayProvider)((name) => config.get(name)),
            },
        ],
        controllers: [payments_controller_1.PaymentsController, sandbox_payments_controller_1.SandboxPaymentsController],
        exports: [payments_service_1.PaymentsService],
    })
], PaymentsModule);
//# sourceMappingURL=payments.module.js.map