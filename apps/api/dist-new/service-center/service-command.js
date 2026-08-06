"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredServiceKey = requiredServiceKey;
exports.serviceJson = serviceJson;
exports.replayServiceCommand = replayServiceCommand;
exports.isServiceCommandUniqueViolation = isServiceCommandUniqueViolation;
const errors_1 = require("../common/errors");
const prisma_errors_1 = require("../common/prisma-errors");
function requiredServiceKey(value) {
    const key = value?.trim();
    if (!key || key.length > 128) {
        throw new errors_1.ValidationError('invalid_idempotency_key', 'Нужен Idempotency-Key до 128 символов');
    }
    return key;
}
function serviceJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function replayServiceCommand(command, action, request) {
    if (command.action !== action || canonical(command.request) !== canonical(request)) {
        throw new errors_1.ConflictError('idempotency_key_reused', 'Idempotency-Key уже использован другой service-командой');
    }
    return command.response;
}
function isServiceCommandUniqueViolation(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}
//# sourceMappingURL=service-command.js.map