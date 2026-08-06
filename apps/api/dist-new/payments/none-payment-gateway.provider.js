"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonePaymentGatewayProvider = void 0;
const common_1 = require("@nestjs/common");
class NonePaymentGatewayProvider {
    constructor() {
        this.name = 'none';
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
    unavailable() {
        throw new common_1.ServiceUnavailableException({
            code: 'online_payments_unavailable',
            message: 'Онлайн-оплата не подключена. Заказ оплачивается при получении.',
        });
    }
}
exports.NonePaymentGatewayProvider = NonePaymentGatewayProvider;
//# sourceMappingURL=none-payment-gateway.provider.js.map