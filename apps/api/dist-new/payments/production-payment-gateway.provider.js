"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionPaymentGatewayProvider = void 0;
const common_1 = require("@nestjs/common");
class ProductionPaymentGatewayProvider {
    constructor(options) {
        this.options = options;
        this.name = 'production';
    }
    assertOperational() {
        this.unavailable();
    }
    createIntent(_input) {
        return this.unavailable();
    }
    verifyWebhook(_input) {
        return this.unavailable();
    }
    verifyRefundWebhook(_input) {
        return this.unavailable();
    }
    refund(_input) {
        return this.unavailable();
    }
    isConfigured() {
        return Object.values(this.options).every((value) => value.length > 0);
    }
    unavailable() {
        throw new common_1.ServiceUnavailableException({
            code: 'production_payment_gateway_not_activated',
            message: 'Боевой платёжный адаптер ждёт договор и спецификацию провайдера',
        });
    }
}
exports.ProductionPaymentGatewayProvider = ProductionPaymentGatewayProvider;
//# sourceMappingURL=production-payment-gateway.provider.js.map