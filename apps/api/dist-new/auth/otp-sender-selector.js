"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectOtpSender = selectOtpSender;
const android_gateway_otp_sender_1 = require("./android-gateway-otp.sender");
const disabled_otp_sender_1 = require("./disabled-otp.sender");
const noop_otp_sender_1 = require("./noop-otp.sender");
const production_otp_sender_1 = require("./production-otp.sender");
function selectOtpSender(env) {
    const mode = env('SMS_PROVIDER')?.trim().toLowerCase();
    if (mode === 'disabled')
        return new disabled_otp_sender_1.DisabledOtpSender();
    if (!mode || mode === 'noop') {
        if (env('NODE_ENV') === 'production') {
            throw new Error('SMS_PROVIDER is required in production (use "disabled" to run without SMS login)');
        }
        return new noop_otp_sender_1.NoopOtpSender();
    }
    if (mode === 'android_gateway') {
        const passphrase = value(env, 'SMS_GATEWAY_ENCRYPTION_PASSPHRASE');
        if (!passphrase) {
            throw new Error('SMS_GATEWAY_ENCRYPTION_PASSPHRASE is required: OTP must not reach the public relay in cleartext');
        }
        const gateway = {
            url: value(env, 'SMS_GATEWAY_URL'),
            username: value(env, 'SMS_GATEWAY_USERNAME'),
            password: value(env, 'SMS_GATEWAY_PASSWORD'),
        };
        const absent = Object.entries(gateway).filter(([, item]) => !item).map(([name]) => name);
        if (absent.length) {
            throw new Error(`Incomplete Android SMS gateway configuration: ${absent.join(', ')}`);
        }
        return new android_gateway_otp_sender_1.AndroidGatewayOtpSender({ ...gateway, passphrase });
    }
    if (mode !== 'production') {
        throw new Error(`Unsupported SMS_PROVIDER: ${mode}`);
    }
    const options = {
        apiUrl: value(env, 'SMS_API_URL'),
        apiKey: value(env, 'SMS_API_KEY'),
        senderId: value(env, 'SMS_SENDER_ID'),
    };
    const missing = Object.entries(options).filter(([, item]) => !item).map(([name]) => name);
    if (missing.length) {
        throw new Error(`Incomplete production SMS configuration: ${missing.join(', ')}`);
    }
    return new production_otp_sender_1.ProductionOtpSender(options);
}
function value(env, name) {
    return env(name)?.trim() ?? '';
}
//# sourceMappingURL=otp-sender-selector.js.map