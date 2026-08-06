"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxPaymentGatewayProvider = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const PROVIDER = {
    card: 'card',
    qr_mbank: 'mbank',
    qr_odengi: 'odengi',
    installment: 'installment',
};
class SandboxPaymentGatewayProvider {
    constructor(webhookSecret = '') {
        this.webhookSecret = webhookSecret;
        this.name = 'sandbox';
    }
    assertOperational() { }
    async createIntent(input) {
        const provider = PROVIDER[input.method];
        const issuedAt = Date.now();
        const replayToken = input.idempotencyKey
            ? (0, node_crypto_1.createHash)('sha256').update(input.idempotencyKey).digest('hex').slice(0, 16)
            : issuedAt.toString(36);
        const txnId = `${provider}-${input.orderId}-${replayToken}`;
        const intentId = `PI-${input.orderId.slice(-8).toUpperCase()}-${replayToken.toUpperCase()}`;
        const expiresAt = new Date(issuedAt + 15 * 60 * 1000).toISOString();
        return {
            intentId,
            provider,
            orderId: input.orderId,
            orderStatus: input.orderStatus,
            method: input.method,
            amount: input.amount,
            txnId,
            status: 'requires_action',
            expiresAt,
            paymentUrl: this.paymentUrl(provider, intentId, input.returnUrl),
            qrPayload: this.qrPayload(provider, input.orderId, input.amount, txnId),
        };
    }
    async verifyWebhook(input) {
        this.assertWebhookSignature(input.rawBody, input.headers);
        return input.payload;
    }
    async refund(input) {
        return { providerRefundId: `sandbox-refund-${input.idempotencyKey}`, status: 'succeeded' };
    }
    async verifyRefundWebhook(input) {
        this.assertWebhookSignature(input.rawBody, input.headers);
        const payload = input.payload;
        if (!payload.providerRefundId || !['succeeded', 'failed'].includes(payload.status ?? '')) {
            throw new Error('invalid sandbox refund webhook');
        }
        return payload;
    }
    assertWebhookSignature(rawBody, headers) {
        const provided = headers['x-alistore-signature'];
        const signature = Array.isArray(provided) ? provided[0] : provided;
        if (!this.webhookSecret || !rawBody || !signature) {
            throw new common_1.NotFoundException('Webhook недоступен');
        }
        const expected = (0, node_crypto_1.createHmac)('sha256', this.webhookSecret).update(rawBody).digest('hex');
        const normalized = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
        const expectedBytes = Buffer.from(expected, 'utf8');
        const receivedBytes = Buffer.from(normalized, 'utf8');
        if (receivedBytes.length !== expectedBytes.length || !(0, node_crypto_1.timingSafeEqual)(receivedBytes, expectedBytes)) {
            throw new common_1.NotFoundException('Webhook недоступен');
        }
    }
    paymentUrl(provider, intentId, returnUrl) {
        const base = `/api/sandbox/payments/${provider}/${intentId}`;
        return returnUrl ? `${base}?returnUrl=${encodeURIComponent(returnUrl)}` : base;
    }
    qrPayload(provider, orderId, amount, txnId) {
        if (provider !== 'mbank' && provider !== 'odengi')
            return null;
        return `alistore-${provider}://pay?order=${encodeURIComponent(orderId)}&amount=${amount}&txn=${encodeURIComponent(txnId)}`;
    }
}
exports.SandboxPaymentGatewayProvider = SandboxPaymentGatewayProvider;
//# sourceMappingURL=sandbox-payment-gateway.provider.js.map