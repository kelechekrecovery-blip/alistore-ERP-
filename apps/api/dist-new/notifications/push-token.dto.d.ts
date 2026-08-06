export declare const FCM_TOKEN_PATTERN: RegExp;
export declare const PUSH_TOKEN_PATTERN: RegExp;
export declare const PUSH_PLATFORMS: readonly ["ios", "android", "web", "unknown"];
export declare const PUSH_SCOPES: readonly ["anonymous", "customer", "staff"];
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];
export type PushScope = (typeof PUSH_SCOPES)[number];
export declare class RegisterPushTokenDto {
    token: string;
    platform: PushPlatform;
    deviceId: string;
    scope?: PushScope;
}
