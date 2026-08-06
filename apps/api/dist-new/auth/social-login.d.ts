export type SocialProvider = 'telegram' | 'apple' | 'google';
export type TelegramAuthSource = 'mini_app' | 'login_widget';
export interface SocialProfile {
    provider: SocialProvider;
    subject: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
}
export interface VerifiedTelegramProfile extends SocialProfile {
    replayIdentity: string;
}
export interface TelegramLoginInput {
    initData: string;
    source?: TelegramAuthSource;
    now?: Date;
    maxAgeSeconds?: number;
}
export interface AppleLoginInput {
    identityToken: string;
    clientId: string;
    jwksUrl?: string;
    nonce?: string;
    name?: string;
    now?: Date;
}
export interface GoogleLoginInput {
    identityToken: string;
    clientId: string;
    nonce: string;
}
export declare function verifyTelegramLogin(input: TelegramLoginInput, botToken: string): VerifiedTelegramProfile;
export declare function verifyAppleIdentityToken(input: AppleLoginInput): Promise<SocialProfile>;
export declare function verifyGoogleIdentityToken(input: GoogleLoginInput): Promise<SocialProfile>;
