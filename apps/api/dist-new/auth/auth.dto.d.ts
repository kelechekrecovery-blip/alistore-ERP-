import type { TelegramAuthSource } from './social-login';
export declare class RequestOtpDto {
    phone: string;
}
export declare class VerifyOtpDto {
    phone: string;
    code: string;
    challengeId?: string;
}
export declare class RequestEmailOtpDto {
    email: string;
}
export declare class VerifyEmailOtpDto extends RequestEmailOtpDto {
    code: string;
    challengeId?: string;
}
export declare class RefreshDto {
    refreshToken: string;
}
export declare class TelegramSocialLoginDto {
    initData: string;
    source?: TelegramAuthSource;
}
export declare class AppleSocialLoginDto {
    identityToken: string;
    nonce?: string;
    name?: string;
}
export declare class GoogleSocialLoginDto {
    identityToken: string;
    nonce: string;
}
export declare class CompleteSocialEnrollmentDto extends VerifyOtpDto {
    enrollmentToken: string;
}
