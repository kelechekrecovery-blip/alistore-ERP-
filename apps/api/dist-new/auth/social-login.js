"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTelegramLogin = verifyTelegramLogin;
exports.verifyAppleIdentityToken = verifyAppleIdentityToken;
exports.verifyGoogleIdentityToken = verifyGoogleIdentityToken;
const node_crypto_1 = require("node:crypto");
const google_auth_library_1 = require("google-auth-library");
const errors_1 = require("../common/errors");
const googleOAuthClient = new google_auth_library_1.OAuth2Client();
const TELEGRAM_DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_MAX_FUTURE_SKEW_SECONDS = 30;
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
function verifyTelegramLogin(input, botToken) {
    const params = new URLSearchParams(input.initData);
    const receivedHash = params.get('hash');
    if (!receivedHash) {
        throw new errors_1.ValidationError('telegram_auth_invalid', 'Telegram auth hash is missing');
    }
    const dataCheckString = telegramDataCheckString(params);
    const expectedHash = input.source === 'login_widget'
        ? telegramLoginWidgetHash(dataCheckString, botToken)
        : telegramMiniAppHash(dataCheckString, botToken);
    if (!safeEqualHex(receivedHash, expectedHash)) {
        throw new errors_1.ValidationError('telegram_auth_invalid', 'Telegram auth hash is invalid');
    }
    const authDate = Number(params.get('auth_date') ?? '0');
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
    const maxAge = input.maxAgeSeconds ?? TELEGRAM_DEFAULT_MAX_AGE_SECONDS;
    if (!Number.isFinite(authDate)
        || authDate <= 0
        || authDate > nowSeconds + TELEGRAM_MAX_FUTURE_SKEW_SECONDS
        || nowSeconds - authDate > maxAge) {
        throw new errors_1.ValidationError('telegram_auth_expired', 'Telegram auth data expired');
    }
    const user = telegramUserFromParams(params, input.source ?? 'mini_app');
    if (!user.id) {
        throw new errors_1.ValidationError('telegram_auth_invalid', 'Telegram user id is missing');
    }
    const source = input.source ?? 'mini_app';
    return {
        provider: 'telegram',
        subject: String(user.id),
        displayName: displayName([
            user.first_name,
            user.last_name,
            user.username ? `@${user.username}` : undefined,
        ]),
        avatarUrl: user.photo_url,
        replayIdentity: [
            'telegram',
            source,
            dataCheckString,
            receivedHash.toLowerCase(),
        ].join('\n'),
    };
}
async function verifyAppleIdentityToken(input) {
    const parts = input.identityToken.split('.');
    if (parts.length !== 3) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token is malformed');
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJwtJson(encodedHeader);
    const claims = decodeJwtJson(encodedPayload);
    if (header.alg !== 'RS256' || !header.kid) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token header is invalid');
    }
    const jwk = await appleJwk(header.kid, input.jwksUrl ?? APPLE_JWKS_URL);
    const publicKey = (0, node_crypto_1.createPublicKey)({ key: jwk, format: 'jwk' });
    const verified = (0, node_crypto_1.verify)('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, 'base64url'));
    if (!verified) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token signature is invalid');
    }
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
    if (claims.iss !== APPLE_ISSUER) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token issuer is invalid');
    }
    if (!audienceMatches(claims.aud, input.clientId)) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token audience is invalid');
    }
    if (!claims.exp || claims.exp <= nowSeconds) {
        throw new errors_1.ValidationError('apple_token_expired', 'Apple identity token expired');
    }
    if (!claims.sub) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token subject is missing');
    }
    if (input.nonce && claims.nonce !== input.nonce) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token nonce mismatch');
    }
    return {
        provider: 'apple',
        subject: claims.sub,
        email: claims.email,
        displayName: displayName([input.name, claims.email]),
    };
}
async function verifyGoogleIdentityToken(input) {
    const audiences = input.clientId
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (audiences.length === 0) {
        throw new errors_1.ValidationError('social_provider_not_configured', 'Google login is not configured');
    }
    try {
        const ticket = await googleOAuthClient.verifyIdToken({
            idToken: input.identityToken,
            audience: audiences,
        });
        const claims = ticket.getPayload();
        if (!claims?.sub) {
            throw new errors_1.ValidationError('google_token_invalid', 'Google identity token subject is missing');
        }
        if (!input.nonce || claims.nonce !== input.nonce) {
            throw new errors_1.ValidationError('google_token_invalid', 'Google identity token nonce mismatch');
        }
        return {
            provider: 'google',
            subject: claims.sub,
            email: claims.email_verified ? claims.email : undefined,
            displayName: displayName([claims.name, claims.email_verified ? claims.email : undefined]),
            avatarUrl: claims.picture,
        };
    }
    catch (error) {
        if (error instanceof errors_1.ValidationError)
            throw error;
        throw new errors_1.ValidationError('google_token_invalid', 'Google identity token is invalid');
    }
}
function telegramDataCheckString(params) {
    return [...params.entries()]
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
}
function telegramMiniAppHash(dataCheckString, botToken) {
    const secret = (0, node_crypto_1.createHmac)('sha256', 'WebAppData').update(botToken).digest();
    return (0, node_crypto_1.createHmac)('sha256', secret).update(dataCheckString).digest('hex');
}
function telegramLoginWidgetHash(dataCheckString, botToken) {
    const secret = (0, node_crypto_1.createHash)('sha256').update(botToken).digest();
    return (0, node_crypto_1.createHmac)('sha256', secret).update(dataCheckString).digest('hex');
}
function telegramUserFromParams(params, source) {
    if (source === 'login_widget') {
        return {
            id: params.get('id') ?? undefined,
            first_name: params.get('first_name') ?? undefined,
            last_name: params.get('last_name') ?? undefined,
            username: params.get('username') ?? undefined,
            photo_url: params.get('photo_url') ?? undefined,
        };
    }
    const rawUser = params.get('user');
    if (!rawUser)
        return {};
    try {
        return JSON.parse(rawUser);
    }
    catch {
        throw new errors_1.ValidationError('telegram_auth_invalid', 'Telegram user payload is invalid');
    }
}
async function appleJwk(kid, jwksUrl) {
    const response = await fetch(jwksUrl);
    if (!response.ok) {
        throw new errors_1.ValidationError('apple_jwks_unavailable', 'Apple JWKS is unavailable');
    }
    const jwks = (await response.json());
    const key = jwks.keys?.find((candidate) => candidate.kid === kid);
    if (!key) {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple signing key is unknown');
    }
    return key;
}
function decodeJwtJson(segment) {
    try {
        return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    }
    catch {
        throw new errors_1.ValidationError('apple_token_invalid', 'Apple identity token is malformed');
    }
}
function safeEqualHex(left, right) {
    if (!/^[a-f0-9]+$/i.test(left) || left.length !== right.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function audienceMatches(audience, clientId) {
    const allowed = clientId
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (allowed.length === 0)
        return false;
    const claimed = Array.isArray(audience) ? audience : [audience];
    return claimed.some((value) => typeof value === 'string' && allowed.includes(value));
}
function displayName(values) {
    const parts = values
        .map((value) => value?.trim())
        .filter((value) => Boolean(value));
    return parts.length ? parts.join(' ') : undefined;
}
//# sourceMappingURL=social-login.js.map