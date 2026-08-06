"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueGuestCheckoutCapability = issueGuestCheckoutCapability;
exports.issueGuestOrderCapability = issueGuestOrderCapability;
exports.guestOrderCapabilityTtlSeconds = guestOrderCapabilityTtlSeconds;
exports.requireGuestCapability = requireGuestCapability;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = require("jsonwebtoken");
const jwt_secret_1 = require("./jwt-secret");
const ISSUER = 'alistore-api';
const AUDIENCE = 'alistore-guest-checkout';
const secret = jwt_secret_1.resolveJwtSecretFromEnv;
function issueGuestCheckoutCapability(customerId) {
    return (0, jsonwebtoken_1.sign)({
        sub: customerId,
        typ: 'guest_capability',
        scopes: [
            'orders:create',
            'payments:intent',
            'payments:gift_card',
            'support:create',
            'warranty:create',
            'tradeins:create',
            'evidence:write',
            'evidence:read',
        ],
    }, secret(), { issuer: ISSUER, audience: AUDIENCE, expiresIn: '30m' });
}
function issueGuestOrderCapability(customerId, orderId, expiresInSeconds = guestOrderCapabilityTtlSeconds()) {
    return (0, jsonwebtoken_1.sign)({
        sub: customerId,
        typ: 'guest_capability',
        scopes: ['orders:read', 'receipts:read'],
        entity: { type: 'order', id: orderId },
    }, secret(), { issuer: ISSUER, audience: AUDIENCE, expiresIn: expiresInSeconds });
}
function guestOrderCapabilityTtlSeconds() {
    const configured = Number(process.env.GUEST_ORDER_CAPABILITY_TTL_SECONDS ?? 7 * 24 * 60 * 60);
    return Number.isInteger(configured) && configured >= 60 && configured <= 30 * 24 * 60 * 60
        ? configured
        : 7 * 24 * 60 * 60;
}
function requireGuestCapability(token, scope, customerId, entity) {
    if (!token)
        throw new common_1.UnauthorizedException('guest_capability_required');
    let claims;
    try {
        claims = (0, jsonwebtoken_1.verify)(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
    }
    catch {
        throw new common_1.UnauthorizedException('guest_capability_invalid');
    }
    if (claims.typ !== 'guest_capability' || !Array.isArray(claims.scopes) || !claims.scopes.includes(scope)) {
        throw new common_1.ForbiddenException('guest_capability_scope_denied');
    }
    if (customerId && claims.sub !== customerId) {
        throw new common_1.ForbiddenException('guest_capability_owner_mismatch');
    }
    if (entity && (claims.entity?.type !== entity.type || claims.entity.id !== entity.id)) {
        throw new common_1.ForbiddenException('guest_capability_entity_mismatch');
    }
    return claims;
}
//# sourceMappingURL=guest-capability.js.map