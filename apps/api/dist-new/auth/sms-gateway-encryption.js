"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SMS_GATEWAY_ITERATIONS = void 0;
exports.encryptGatewayField = encryptGatewayField;
const node_crypto_1 = require("node:crypto");
const SALT_BYTES = 16;
const KEY_BYTES = 32;
exports.DEFAULT_SMS_GATEWAY_ITERATIONS = 75_000;
function encryptGatewayField(cleartext, passphrase, options = {}) {
    if (!passphrase) {
        throw new Error('SMS gateway encryption passphrase is required');
    }
    const iterations = options.iterations ?? exports.DEFAULT_SMS_GATEWAY_ITERATIONS;
    const salt = options.salt ?? (0, node_crypto_1.randomBytes)(SALT_BYTES);
    const key = (0, node_crypto_1.pbkdf2Sync)(passphrase, salt, iterations, KEY_BYTES, 'sha1');
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-cbc', key, salt);
    const payload = Buffer.concat([cipher.update(cleartext, 'utf8'), cipher.final()]);
    return [
        '',
        'aes-256-cbc/pbkdf2-sha1',
        `i=${iterations}`,
        salt.toString('base64'),
        payload.toString('base64'),
    ].join('$');
}
//# sourceMappingURL=sms-gateway-encryption.js.map