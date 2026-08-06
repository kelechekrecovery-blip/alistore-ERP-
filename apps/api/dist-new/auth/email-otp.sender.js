"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopEmailOtpSender = exports.EMAIL_OTP_SENDER = void 0;
exports.EMAIL_OTP_SENDER = Symbol('EMAIL_OTP_SENDER');
class NoopEmailOtpSender {
    constructor() {
        this.name = 'noop';
    }
    assertOperational() {
    }
    async send() {
    }
}
exports.NoopEmailOtpSender = NoopEmailOtpSender;
//# sourceMappingURL=email-otp.sender.js.map