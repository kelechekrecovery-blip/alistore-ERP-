"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_SESSION_HINT_COOKIE = exports.STAFF_REFRESH_COOKIE = exports.STAFF_ACCESS_COOKIE = exports.STAFF_WEB_SESSION_HEADER = exports.WEB_SESSION_HINT_COOKIE = exports.WEB_REFRESH_COOKIE = exports.WEB_ACCESS_COOKIE = exports.WEB_SESSION_HEADER = void 0;
exports.isWebSessionRequest = isWebSessionRequest;
exports.isStaffWebSessionRequest = isStaffWebSessionRequest;
exports.readWebCookie = readWebCookie;
exports.setWebSessionCookies = setWebSessionCookies;
exports.clearWebSessionCookies = clearWebSessionCookies;
exports.setStaffSessionCookies = setStaffSessionCookies;
exports.clearStaffSessionCookies = clearStaffSessionCookies;
exports.webAuthResponse = webAuthResponse;
exports.WEB_SESSION_HEADER = 'x-alistore-web';
exports.WEB_ACCESS_COOKIE = 'alistore_access';
exports.WEB_REFRESH_COOKIE = 'alistore_refresh';
exports.WEB_SESSION_HINT_COOKIE = 'alistore_session_hint';
exports.STAFF_WEB_SESSION_HEADER = 'x-alistore-staff-web';
exports.STAFF_ACCESS_COOKIE = 'alistore_staff_access';
exports.STAFF_REFRESH_COOKIE = 'alistore_staff_refresh';
exports.STAFF_SESSION_HINT_COOKIE = 'alistore_staff_session_hint';
function isWebSessionRequest(request) {
    const value = request.headers[exports.WEB_SESSION_HEADER];
    return value === '1' || value === 'true';
}
function isStaffWebSessionRequest(request) {
    const value = request.headers[exports.STAFF_WEB_SESSION_HEADER];
    return value === '1' || value === 'true';
}
function readWebCookie(request, name) {
    const header = request.headers.cookie;
    if (!header)
        return undefined;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0)
            continue;
        const key = part.slice(0, separator).trim();
        if (key !== name)
            continue;
        return decodeURIComponent(part.slice(separator + 1).trim());
    }
    return undefined;
}
function cookieOptions(production, maxAge) {
    return {
        httpOnly: true,
        secure: production,
        sameSite: 'lax',
        path: '/api',
        maxAge,
    };
}
function sessionHintOptions(production, maxAge) {
    const configuredDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
    return {
        httpOnly: false,
        secure: production,
        sameSite: 'lax',
        path: '/',
        maxAge,
        ...(production && configuredDomain ? { domain: configuredDomain } : {}),
    };
}
function staffCookieOptions(production, maxAge) {
    return { ...cookieOptions(production, maxAge), path: '/api' };
}
function staffHintOptions(production, maxAge) {
    return { ...sessionHintOptions(production, maxAge), path: '/' };
}
function setWebSessionCookies(response, tokens, production) {
    response.cookie(exports.WEB_ACCESS_COOKIE, tokens.accessToken, cookieOptions(production, 15 * 60 * 1000));
    response.cookie(exports.WEB_REFRESH_COOKIE, tokens.refreshToken, cookieOptions(production, 30 * 24 * 60 * 60 * 1000));
    response.cookie(exports.WEB_SESSION_HINT_COOKIE, '1', sessionHintOptions(production, 30 * 24 * 60 * 60 * 1000));
}
function clearWebSessionCookies(response, production) {
    const options = cookieOptions(production, 0);
    response.clearCookie(exports.WEB_ACCESS_COOKIE, options);
    response.clearCookie(exports.WEB_REFRESH_COOKIE, options);
    response.clearCookie(exports.WEB_SESSION_HINT_COOKIE, sessionHintOptions(production, 0));
}
function setStaffSessionCookies(response, tokens, production) {
    response.cookie(exports.STAFF_ACCESS_COOKIE, tokens.accessToken, staffCookieOptions(production, 15 * 60 * 1000));
    response.cookie(exports.STAFF_REFRESH_COOKIE, tokens.refreshToken, staffCookieOptions(production, 30 * 24 * 60 * 60 * 1000));
    response.cookie(exports.STAFF_SESSION_HINT_COOKIE, '1', staffHintOptions(production, 30 * 24 * 60 * 60 * 1000));
}
function clearStaffSessionCookies(response, production) {
    response.clearCookie(exports.STAFF_ACCESS_COOKIE, staffCookieOptions(production, 0));
    response.clearCookie(exports.STAFF_REFRESH_COOKIE, staffCookieOptions(production, 0));
    response.clearCookie(exports.STAFF_SESSION_HINT_COOKIE, staffHintOptions(production, 0));
}
function webAuthResponse(request, tokens) {
    if (!isWebSessionRequest(request))
        return tokens;
    const { refreshToken: _refreshToken, ...safe } = tokens;
    return safe;
}
//# sourceMappingURL=web-session.js.map