"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionOtpSender = void 0;
const common_1 = require("@nestjs/common");
class ProductionOtpSender {
    constructor(options) {
        this.options = options;
        this.name = 'production';
    }
    assertOperational() {
        this.unavailable();
    }
    send(_input) {
        return this.unavailable();
    }
    isConfigured() {
        return Object.values(this.options).every((value) => value.length > 0);
    }
    unavailable() {
        throw new common_1.ServiceUnavailableException({
            code: 'production_sms_provider_not_activated',
            message: 'Боевой SMS-адаптер ждёт договор и спецификацию провайдера',
        });
    }
}
exports.ProductionOtpSender = ProductionOtpSender;
//# sourceMappingURL=production-otp.sender.js.map