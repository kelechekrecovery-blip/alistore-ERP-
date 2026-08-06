"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertStrongPassword = assertStrongPassword;
const errors_1 = require("../common/errors");
const MIN_LENGTH = 12;
const MIN_CLASSES = 3;
const WEAK_FRAGMENTS = [
    'password', 'parol', 'qwerty', 'qazwsx', 'iloveyou', 'admin', 'welcome',
    'letmein', 'monkey', 'dragon', 'abc123', 'alistore',
];
const WEAK_SEQUENCES = ['123456789012', '1234567890', '12345678', '00000000', '11111111'];
function characterClasses(password) {
    let classes = 0;
    if (/[a-z]/.test(password))
        classes += 1;
    if (/[A-Z]/.test(password))
        classes += 1;
    if (/[0-9]/.test(password))
        classes += 1;
    if (/[^a-zA-Z0-9]/.test(password))
        classes += 1;
    return classes;
}
function assertStrongPassword(password) {
    if (password.length < MIN_LENGTH) {
        throw new errors_1.ValidationError('password_too_weak', `Пароль короче ${MIN_LENGTH} символов`);
    }
    if (characterClasses(password) < MIN_CLASSES) {
        throw new errors_1.ValidationError('password_too_weak', `Нужно минимум ${MIN_CLASSES} класса символов из четырёх: строчные, прописные, цифры, спецсимволы`);
    }
    const lower = password.toLowerCase();
    if (WEAK_SEQUENCES.includes(password) || WEAK_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
        throw new errors_1.ValidationError('password_too_weak', 'Пароль содержит распространённую последовательность — выберите другой');
    }
}
//# sourceMappingURL=password-policy.js.map