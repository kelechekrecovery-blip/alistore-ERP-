"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisabledOtpSender = void 0;
const common_1 = require("@nestjs/common");
class DisabledOtpSender {
    constructor() {
        this.name = 'disabled';
    }
    assertOperational() {
        this.unavailable();
    }
    async send(_input) {
        this.unavailable();
    }
    unavailable() {
        throw new common_1.ServiceUnavailableException({
            code: 'sms_login_unavailable',
            message: 'Вход по SMS не подключён. Заказ можно оформить без входа в аккаунт.',
        });
    }
}
exports.DisabledOtpSender = DisabledOtpSender;
//# sourceMappingURL=disabled-otp.sender.js.map