"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopOtpSender = void 0;
class NoopOtpSender {
    constructor() {
        this.name = 'noop';
    }
    assertOperational() { }
    async send(_input) { }
}
exports.NoopOtpSender = NoopOtpSender;
//# sourceMappingURL=noop-otp.sender.js.map