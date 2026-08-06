"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeAuthMethods = describeAuthMethods;
function describeAuthMethods(env) {
    const production = env('NODE_ENV') === 'production';
    const phoneEnabled = resolvePhoneChannel(env, production);
    const phone = { enabled: phoneEnabled, registers: phoneEnabled };
    const emailFlagAllows = !production || env('AUTH_EMAIL_LOGIN_ENABLED')?.trim() === 'true';
    const emailTransportAllows = !production || Boolean(env('SMTP_HOST')?.trim());
    const email = {
        enabled: emailFlagAllows && emailTransportAllows,
        registers: false,
    };
    const telegramEnabled = Boolean(env('TELEGRAM_BOT_TOKEN')?.trim());
    const telegram = {
        enabled: telegramEnabled,
        registers: telegramEnabled && phoneEnabled,
        botUsername: telegramEnabled ? env('TELEGRAM_BOT_USERNAME')?.trim() || null : null,
    };
    const appleTokenAudiences = appleAudiences(env);
    const appleEnabled = appleTokenAudiences.length > 0;
    const configuredAppleWebClientId = appleWebClientId(env);
    const apple = {
        enabled: appleEnabled,
        registers: appleEnabled && phoneEnabled,
        clientId: configuredAppleWebClientId && appleTokenAudiences.includes(configuredAppleWebClientId)
            ? configuredAppleWebClientId
            : null,
    };
    const googleTokenAudiences = googleAudiences(env);
    const googleEnabled = googleTokenAudiences.length > 0;
    const configuredGoogleWebClientId = env('GOOGLE_WEB_CLIENT_ID')?.trim() || null;
    const google = {
        enabled: googleEnabled,
        registers: googleEnabled && phoneEnabled,
        clientId: configuredGoogleWebClientId && googleTokenAudiences.includes(configuredGoogleWebClientId)
            ? configuredGoogleWebClientId
            : null,
    };
    const recoveryConfigured = env('AUTH_RECOVERY_OTP_ENABLED')?.trim();
    const recoveryRolloutAllows = recoveryConfigured === 'true'
        || (!production && recoveryConfigured !== 'false');
    return {
        phone,
        email,
        telegram,
        apple,
        recovery: { enabled: recoveryRolloutAllows && phoneEnabled },
        google,
        anyLoginAvailable: phone.enabled || email.enabled || telegram.enabled || apple.enabled || google.enabled,
        registrationAvailable: phone.registers || telegram.registers || apple.registers || google.registers,
    };
}
function googleAudiences(env) {
    return (env('GOOGLE_CLIENT_ID') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
function resolvePhoneChannel(env, production) {
    const mode = env('SMS_PROVIDER')?.trim().toLowerCase();
    if (mode === 'android_gateway')
        return true;
    if (mode === 'disabled' || mode === 'production')
        return false;
    return !production;
}
function appleAudiences(env) {
    return (env('APPLE_CLIENT_ID') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
function appleWebClientId(env) {
    return env('APPLE_WEB_CLIENT_ID')?.trim() || null;
}
//# sourceMappingURL=auth-methods.js.map