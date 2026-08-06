import { HttpException, HttpStatus } from '@nestjs/common';
export declare class DomainError extends HttpException {
    readonly code: string;
    constructor(status: HttpStatus, code: string, message: string);
}
export declare class ConflictError extends DomainError {
    constructor(code: string, message: string);
}
export declare class UnauthorizedError extends DomainError {
    constructor(code: string, message: string);
}
export declare class ForbiddenError extends DomainError {
    constructor(code: string, message: string);
}
export declare class ValidationError extends DomainError {
    constructor(code: string, message: string);
}
export declare class PaymentFailedError extends DomainError {
    constructor(code: string, message: string);
}
