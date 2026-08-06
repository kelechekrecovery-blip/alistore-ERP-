"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FcmPushTransport = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const push_token_dto_1 = require("../../notifications/push-token.dto");
const fetch_with_timeout_1 = require("./fetch-with-timeout");
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEAD_TOKEN_CODES = new Set(['UNREGISTERED']);
class FcmPushTransport {
    constructor(config, prisma, sender) {
        this.prisma = prisma;
        this.sender = sender ?? new FcmHttpV1Sender(resolveServiceAccount(config));
    }
    async deliver(message) {
        const tokens = await this.resolveTokens(message.recipient);
        if (tokens.length === 0) {
            throw new Error(`push_recipient_unavailable: no active FCM tokens for ${message.recipient}`);
        }
        const payload = jsonObject(message.payload);
        const results = await Promise.all(tokens.map(async (token) => ({
            token,
            result: await this.sender.send(this.toMessage(token, message, payload)),
        })));
        const dead = results.filter(({ result }) => !result.ok && DEAD_TOKEN_CODES.has(result.code ?? ''))
            .map(({ token }) => token);
        if (dead.length > 0) {
            await this.prisma.pushToken.updateMany({ where: { token: { in: dead } }, data: { enabled: false } });
        }
        const retryable = results.filter(({ result }) => !result.ok && !DEAD_TOKEN_CODES.has(result.code ?? ''));
        if (retryable.length > 0) {
            throw new Error(`FCM push failed: ${retryable.map(({ result }) => result.code ?? `HTTP_${result.status}`).join('; ')}`);
        }
    }
    async resolveTokens(recipient) {
        const rows = await this.prisma.pushToken.findMany({
            where: {
                enabled: true,
                platform: 'android',
                OR: [{ customerId: recipient }, { staffId: recipient }],
            },
            select: { token: true },
            orderBy: { lastSeenAt: 'desc' },
            take: 100,
        });
        const registered = rows.map((row) => row.token).filter((token) => push_token_dto_1.FCM_TOKEN_PATTERN.test(token));
        if (registered.length > 0)
            return registered;
        return push_token_dto_1.FCM_TOKEN_PATTERN.test(recipient) ? [recipient] : [];
    }
    toMessage(token, message, payload) {
        const title = text(payload.title) ?? 'AliStore';
        const body = text(payload.message) ?? text(payload.body) ?? titleFor(message.template);
        return {
            token,
            notification: { title, body },
            data: stringData({ ...payload, template: message.template }),
            android: {
                priority: 'HIGH',
                notification: { channel_id: 'operations', click_action: 'ALISTORE_STAFF_PUSH' },
            },
        };
    }
}
exports.FcmPushTransport = FcmPushTransport;
class FcmHttpV1Sender {
    constructor(account) {
        this.account = account;
    }
    async send(message) {
        const accessToken = await this.getAccessToken();
        const response = await (0, fetch_with_timeout_1.fetchWithTimeout)(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`, {
            method: 'POST',
            headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        if (response.ok)
            return { ok: true, status: response.status };
        const body = await responseJson(response);
        return { ok: false, status: response.status, code: fcmErrorCode(body) };
    }
    async getAccessToken() {
        const now = Date.now();
        if (this.accessToken && this.accessToken.expiresAt > now + 60_000)
            return this.accessToken.value;
        const tokenUri = this.account.token_uri?.trim() || DEFAULT_TOKEN_URI;
        const assertion = serviceAccountAssertion(this.account, tokenUri, Math.floor(now / 1000));
        const response = await (0, fetch_with_timeout_1.fetchWithTimeout)(tokenUri, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }),
        });
        const body = await responseJson(response);
        const value = stringField(body, 'access_token');
        if (!response.ok || !value) {
            throw new Error(`FCM OAuth failed: ${response.status}`);
        }
        const expiresIn = numberField(body, 'expires_in') ?? 3600;
        this.accessToken = { value, expiresAt: now + Math.max(60, expiresIn) * 1000 };
        return value;
    }
}
function resolveServiceAccount(config) {
    const inline = config.get('FCM_SERVICE_ACCOUNT_JSON')?.trim();
    const path = config.get('FCM_SERVICE_ACCOUNT_KEY_PATH')?.trim();
    if (!inline && !path)
        throw new Error('FCM service account configuration is required');
    const raw = inline ?? (0, node_fs_1.readFileSync)(path, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error('FCM service account configuration is invalid JSON');
    }
    if (!isObject(parsed)
        || !stringField(parsed, 'project_id')
        || !stringField(parsed, 'client_email')
        || !stringField(parsed, 'private_key')) {
        throw new Error('FCM service account configuration is incomplete');
    }
    return parsed;
}
function serviceAccountAssertion(account, audience, issuedAt) {
    const encodedHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const encodedClaims = base64Url(JSON.stringify({
        iss: account.client_email,
        scope: FCM_SCOPE,
        aud: audience,
        iat: issuedAt,
        exp: issuedAt + 3600,
    }));
    const unsigned = `${encodedHeader}.${encodedClaims}`;
    const signer = (0, node_crypto_1.createSign)('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(account.private_key).toString('base64url')}`;
}
function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}
async function responseJson(response) {
    try {
        return await response.json();
    }
    catch {
        return undefined;
    }
}
function fcmErrorCode(body) {
    if (!isObject(body) || !isObject(body.error))
        return undefined;
    const details = Array.isArray(body.error.details) ? body.error.details : [];
    for (const detail of details) {
        if (isObject(detail) && stringField(detail, 'errorCode'))
            return stringField(detail, 'errorCode');
    }
    return stringField(body.error, 'status');
}
function jsonObject(value) {
    return isObject(value) ? value : {};
}
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stringData(value) {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        if (typeof item === 'string')
            return [[key, item]];
        if (typeof item === 'number' || typeof item === 'boolean')
            return [[key, String(item)]];
        return [];
    }));
}
function stringField(value, key) {
    return isObject(value) && typeof value[key] === 'string' && value[key].trim().length > 0
        ? value[key]
        : undefined;
}
function numberField(value, key) {
    return isObject(value) && typeof value[key] === 'number' ? value[key] : undefined;
}
function text(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
function titleFor(template) {
    return template.split(/[_\s-]+/).filter(Boolean)
        .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join(' ');
}
//# sourceMappingURL=fcm-push.transport.js.map