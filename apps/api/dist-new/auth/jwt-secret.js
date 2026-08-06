"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveJwtSecret = resolveJwtSecret;
exports.resolveJwtSecretFromEnv = resolveJwtSecretFromEnv;
const DEV_FALLBACK = 'dev-insecure-change-me';
function assertUsable(secret, isProd) {
    if (isProd && (!secret || secret === DEV_FALLBACK)) {
        throw new Error('JWT_SECRET must be a strong secret in production (the dev fallback is refused)');
    }
    return secret ?? DEV_FALLBACK;
}
function resolveJwtSecret(config) {
    return assertUsable(config.get('JWT_SECRET'), config.get('NODE_ENV') === 'production');
}
function resolveJwtSecretFromEnv(env = process.env) {
    return assertUsable(env.JWT_SECRET, env.NODE_ENV === 'production');
}
//# sourceMappingURL=jwt-secret.js.map