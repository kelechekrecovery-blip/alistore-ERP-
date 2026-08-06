"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUniqueConstraintViolation = isUniqueConstraintViolation;
const client_1 = require("@prisma/client");
function isUniqueConstraintViolation(error) {
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError)
        return error.code === 'P2002';
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'P2002';
}
//# sourceMappingURL=prisma-errors.js.map