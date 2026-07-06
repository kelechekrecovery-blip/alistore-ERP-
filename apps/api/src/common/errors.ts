import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain errors carry a machine-readable `code` and map to the HTTP statuses
 * defined in reference/api-and-events.md:
 *   409 conflict (двойная продажа IMEI, оплата без резерва)
 *   403 нет прав · 422 валидация · 402 оплата не прошла
 * Every violation of a Business Invariant is surfaced as one of these.
 */
export class DomainError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
  ) {
    super({ statusCode: status, code, message }, status);
  }
}

/** 409 — invariant conflict (IMEI already sold, payment without reservation, …). */
export class ConflictError extends DomainError {
  constructor(code: string, message: string) {
    super(HttpStatus.CONFLICT, code, message);
  }
}

/** 403 — role/permission check failed on the server. */
export class ForbiddenError extends DomainError {
  constructor(code: string, message: string) {
    super(HttpStatus.FORBIDDEN, code, message);
  }
}

/** 422 — validation / illegal state (unknown order, bad transition input). */
export class ValidationError extends DomainError {
  constructor(code: string, message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
  }
}

/** 402 — payment did not go through. */
export class PaymentFailedError extends DomainError {
  constructor(code: string, message: string) {
    super(HttpStatus.PAYMENT_REQUIRED, code, message);
  }
}
