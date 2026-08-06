import type { Request, Response } from 'express';
import type { AuthTokens } from './auth.service';
export declare const WEB_SESSION_HEADER = "x-alistore-web";
export declare const WEB_ACCESS_COOKIE = "alistore_access";
export declare const WEB_REFRESH_COOKIE = "alistore_refresh";
export declare const WEB_SESSION_HINT_COOKIE = "alistore_session_hint";
export declare const STAFF_WEB_SESSION_HEADER = "x-alistore-staff-web";
export declare const STAFF_ACCESS_COOKIE = "alistore_staff_access";
export declare const STAFF_REFRESH_COOKIE = "alistore_staff_refresh";
export declare const STAFF_SESSION_HINT_COOKIE = "alistore_staff_session_hint";
export declare function isWebSessionRequest(request: Pick<Request, 'headers'>): boolean;
export declare function isStaffWebSessionRequest(request: Pick<Request, 'headers'>): boolean;
export declare function readWebCookie(request: Pick<Request, 'headers'>, name: string): string | undefined;
export declare function setWebSessionCookies(response: Response, tokens: AuthTokens, production: boolean): void;
export declare function clearWebSessionCookies(response: Response, production: boolean): void;
export interface WebStaffTokens {
    accessToken: string;
    refreshToken: string;
}
export declare function setStaffSessionCookies(response: Response, tokens: WebStaffTokens, production: boolean): void;
export declare function clearStaffSessionCookies(response: Response, production: boolean): void;
export declare function webAuthResponse<T extends AuthTokens>(request: Pick<Request, 'headers'>, tokens: T): T | Omit<T, 'refreshToken'>;
