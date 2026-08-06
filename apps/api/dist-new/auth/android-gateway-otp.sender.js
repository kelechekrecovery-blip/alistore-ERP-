"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AndroidGatewayOtpSender = void 0;
const common_1 = require("@nestjs/common");
const sms_gateway_encryption_1 = require("./sms-gateway-encryption");
const REQUEST_TIMEOUT_MS = 8_000;
class AndroidGatewayOtpSender {
    constructor(options) {
        this.options = options;
        this.name = 'android_gateway';
    }
    assertOperational() { }
    async send(input) {
        const { passphrase } = this.options;
        const body = JSON.stringify({
            phoneNumbers: [(0, sms_gateway_encryption_1.encryptGatewayField)(input.phone, passphrase)],
            textMessage: { text: (0, sms_gateway_encryption_1.encryptGatewayField)(smsText(input), passphrase) },
            isEncrypted: true,
            ttl: input.expiresInSeconds,
        });
        let response;
        try {
            response = await fetch(`${trimSlash(this.options.url)}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64')}`,
                },
                body,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        }
        catch {
            this.unavailable('sms_gateway_unreachable', 'Шлюз SMS недоступен. Попробуйте ещё раз.');
        }
        if (!response.ok) {
            this.unavailable('sms_gateway_rejected', `Шлюз SMS отклонил отправку (HTTP ${response.status}).`);
        }
    }
    unavailable(code, message) {
        throw new common_1.ServiceUnavailableException({ code, message });
    }
}
exports.AndroidGatewayOtpSender = AndroidGatewayOtpSender;
function smsText(input) {
    const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
    return `AliStore: код ${input.code}. Действует ${minutes} мин. Никому его не сообщайте.`;
}
function trimSlash(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}
//# sourceMappingURL=android-gateway-otp.sender.js.map