"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentFailedError = exports.ValidationError = exports.ForbiddenError = exports.UnauthorizedError = exports.ConflictError = exports.DomainError = void 0;
const common_1 = require("@nestjs/common");
class DomainError extends common_1.HttpException {
    constructor(status, code, message) {
        super({ statusCode: status, code, message }, status);
        this.code = code;
    }
}
exports.DomainError = DomainError;
class ConflictError extends DomainError {
    constructor(code, message) {
        super(common_1.HttpStatus.CONFLICT, code, message);
    }
}
exports.ConflictError = ConflictError;
class UnauthorizedError extends DomainError {
    constructor(code, message) {
        super(common_1.HttpStatus.UNAUTHORIZED, code, message);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends DomainError {
    constructor(code, message) {
        super(common_1.HttpStatus.FORBIDDEN, code, message);
    }
}
exports.ForbiddenError = ForbiddenError;
class ValidationError extends DomainError {
    constructor(code, message) {
        super(common_1.HttpStatus.UNPROCESSABLE_ENTITY, code, message);
    }
}
exports.ValidationError = ValidationError;
class PaymentFailedError extends DomainError {
    constructor(code, message) {
        super(common_1.HttpStatus.PAYMENT_REQUIRED, code, message);
    }
}
exports.PaymentFailedError = PaymentFailedError;
//# sourceMappingURL=errors.js.map