"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCorsOptions = resolveCorsOptions;
exports.resolveHelmetOptions = resolveHelmetOptions;
exports.resolveTrustProxy = resolveTrustProxy;
exports.isPublicHostname = isPublicHostname;
exports.assertProductionModeForPublicHost = assertProductionModeForPublicHost;
exports.resolveAllowedHosts = resolveAllowedHosts;
exports.allowedHostsMiddleware = allowedHostsMiddleware;
function resolveCorsOptions(env) {
    const origins = parseOrigins(env('CORS_ORIGINS'));
    if (env('NODE_ENV') === 'production' && origins.length === 0) {
        throw new Error('CORS_ORIGINS is required in production');
    }
    return origins.length > 0
        ? { origin: origins, credentials: true }
        : { origin: true, credentials: true };
}
function resolveHelmetOptions(env) {
    const production = env('NODE_ENV') === 'production';
    return {
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        strictTransportSecurity: production
            ? { maxAge: 31_536_000, includeSubDomains: true }
            : false,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
                upgradeInsecureRequests: production ? [] : null,
            },
        },
    };
}
function resolveTrustProxy(env) {
    const raw = env('TRUST_PROXY_HOPS')?.trim();
    if (raw === undefined || raw === '') {
        return env('NODE_ENV') === 'production' ? 1 : false;
    }
    const hops = Number(raw);
    if (!Number.isInteger(hops) || hops < 0) {
        throw new Error(`Invalid TRUST_PROXY_HOPS: ${raw}`);
    }
    return hops === 0 ? false : hops;
}
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
function isPublicHostname(host) {
    const value = host.trim().toLowerCase();
    if (!value)
        return false;
    if (LOCAL_HOSTNAMES.has(value) || value.endsWith('.local') || value.endsWith('.localhost'))
        return false;
    if (/^10\./.test(value) || /^192\.168\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value))
        return false;
    return value.includes('.');
}
function assertProductionModeForPublicHost(env, host) {
    if (env('NODE_ENV') === 'production')
        return;
    if (env('ALLOW_NON_PRODUCTION_PUBLIC_HOST')?.trim().toLowerCase() === 'true')
        return;
    if (!isPublicHostname(host))
        return;
    throw new Error(`Refusing to serve public host ${host} with NODE_ENV=${env('NODE_ENV') ?? '<unset>'}. `
        + 'In this mode OTP codes are returned in API responses, session cookies lose Secure, '
        + 'allowed-hosts and metrics auth are skipped, and notifications silently degrade to a log '
        + 'stub. Set NODE_ENV=production, or ALLOW_NON_PRODUCTION_PUBLIC_HOST=true for a staging box.');
}
function resolveAllowedHosts(env) {
    const hosts = (env('ALLOWED_HOSTS') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
    if (env('NODE_ENV') === 'production' && hosts.length === 0) {
        throw new Error('ALLOWED_HOSTS is required in production');
    }
    for (const host of hosts) {
        if (host.includes('://') || host.includes('/') || host.includes(':') || host === 'localhost') {
            throw new Error(`Invalid allowed host: ${host}`);
        }
    }
    return [...new Set(hosts)];
}
function allowedHostsMiddleware(env) {
    const allowed = resolveAllowedHosts(env);
    return (request, response, next) => {
        const requestHost = (request.headers.host ?? '').split(':', 1)[0].toLowerCase();
        if (!request.path.startsWith('/api/health/')) {
            assertProductionModeForPublicHost(env, requestHost);
        }
        if (env('NODE_ENV') !== 'production' || request.path.startsWith('/api/health/')) {
            next();
            return;
        }
        const host = (request.headers.host ?? '').split(':', 1)[0].toLowerCase();
        if (!allowed.includes(host)) {
            response.status(421).json({ statusCode: 421, message: 'Misdirected Request' });
            return;
        }
        next();
    };
}
function parseOrigins(value) {
    return (value ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
        let parsed;
        try {
            parsed = new URL(origin);
        }
        catch {
            throw new Error(`Invalid CORS origin: ${origin}`);
        }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
            throw new Error(`Invalid CORS origin: ${origin}`);
        }
        return origin;
    });
}
//# sourceMappingURL=runtime-security.js.map