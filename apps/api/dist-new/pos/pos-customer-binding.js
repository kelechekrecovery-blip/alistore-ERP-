"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issuePosCustomerBinding = issuePosCustomerBinding;
exports.requirePosCustomerBinding = requirePosCustomerBinding;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = require("jsonwebtoken");
const ISSUER = 'alistore-api';
const AUDIENCE = 'alistore-pos';
const DEV_SECRET = 'dev-insecure-change-me';
function secret() {
    return process.env.JWT_SECRET ?? DEV_SECRET;
}
function normalizedPoint(point) {
    return point.trim().toUpperCase();
}
function issuePosCustomerBinding(customerId, staffId, point, clientSaleId, expiresInSeconds = 24 * 60 * 60) {
    return (0, jsonwebtoken_1.sign)({
        sub: customerId,
        typ: 'pos_customer_binding',
        staffId,
        point: normalizedPoint(point),
        clientSaleId,
    }, secret(), { issuer: ISSUER, audience: AUDIENCE, expiresIn: expiresInSeconds });
}
function requirePosCustomerBinding(token, staffId, point, clientSaleId, options = {}) {
    if (!token)
        throw new common_1.UnauthorizedException('pos_customer_binding_required');
    let claims;
    try {
        claims = (0, jsonwebtoken_1.verify)(token, secret(), {
            issuer: ISSUER,
            audience: AUDIENCE,
            ignoreExpiration: options.allowExpiredReplay === true,
        });
    }
    catch {
        throw new common_1.UnauthorizedException('pos_customer_binding_invalid');
    }
    if (claims.typ !== 'pos_customer_binding') {
        throw new common_1.ForbiddenException('pos_customer_binding_scope_denied');
    }
    if (claims.staffId !== staffId) {
        throw new common_1.ForbiddenException('pos_customer_binding_staff_mismatch');
    }
    if (claims.point !== normalizedPoint(point)) {
        throw new common_1.ForbiddenException('pos_customer_binding_point_mismatch');
    }
    if (!clientSaleId || claims.clientSaleId !== clientSaleId) {
        throw new common_1.ForbiddenException('pos_customer_binding_sale_mismatch');
    }
    return claims;
}
//# sourceMappingURL=pos-customer-binding.js.map