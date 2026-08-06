"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectPaymentGatewayProvider = selectPaymentGatewayProvider;
const none_payment_gateway_provider_1 = require("./none-payment-gateway.provider");
const production_payment_gateway_provider_1 = require("./production-payment-gateway.provider");
const sandbox_payment_gateway_provider_1 = require("./sandbox-payment-gateway.provider");
function selectPaymentGatewayProvider(env) {
    const mode = env('PAYMENT_PROVIDER')?.trim().toLowerCase();
    if (!mode || mode === 'sandbox') {
        return new sandbox_payment_gateway_provider_1.SandboxPaymentGatewayProvider(value(env, 'PAYMENTS_SANDBOX_WEBHOOK_SECRET'));
    }
    if (mode === 'none')
        return new none_payment_gateway_provider_1.NonePaymentGatewayProvider();
    if (mode !== 'production') {
        throw new Error(`Unsupported PAYMENT_PROVIDER: ${mode}`);
    }
    const options = {
        apiUrl: value(env, 'PAYMENT_API_URL'),
        merchantId: value(env, 'PAYMENT_MERCHANT_ID'),
        apiKey: value(env, 'PAYMENT_API_KEY'),
        webhookSecret: value(env, 'PAYMENT_WEBHOOK_SECRET'),
    };
    const missing = Object.entries(options).filter(([, item]) => !item).map(([name]) => name);
    if (missing.length) {
        throw new Error(`Incomplete production payment configuration: ${missing.join(', ')}`);
    }
    return new production_payment_gateway_provider_1.ProductionPaymentGatewayProvider(options);
}
function value(env, name) {
    return env(name)?.trim() ?? '';
}
//# sourceMappingURL=payment-gateway-selector.js.map