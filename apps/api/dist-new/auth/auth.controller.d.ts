import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AppleSocialLoginDto, CompleteSocialEnrollmentDto, GoogleSocialLoginDto, RefreshDto, RequestEmailOtpDto, RequestOtpDto, TelegramSocialLoginDto, VerifyOtpDto, VerifyEmailOtpDto } from './auth.dto';
import { AuthPrincipal } from './jwt.strategy';
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    methods(): import("./auth-methods").AuthMethodsView;
    requestOtp(dto: RequestOtpDto): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    verifyOtp(dto: VerifyOtpDto, request: Request, response: Response): Promise<import("./auth.service").AuthTokens | Omit<import("./auth.service").AuthTokens, "refreshToken">>;
    requestRecovery(dto: RequestOtpDto): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    verifyRecovery(dto: VerifyOtpDto, request: Request, response: Response): Promise<import("./auth.service").AuthTokens | Omit<import("./auth.service").AuthTokens, "refreshToken">>;
    requestEmailOtp(dto: RequestEmailOtpDto): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    verifyEmailOtp(dto: VerifyEmailOtpDto, request: Request, response: Response): Promise<import("./auth.service").AuthTokens | Omit<import("./auth.service").AuthTokens, "refreshToken">>;
    requestEmailAttach(user: AuthPrincipal, dto: RequestEmailOtpDto): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    confirmEmailAttach(user: AuthPrincipal, dto: VerifyEmailOtpDto): Promise<void>;
    telegramSocialLogin(dto: TelegramSocialLoginDto, request: Request, response: Response): Promise<import("./auth.service").AuthTokens | Omit<import("./auth.service").AuthTokens, "refreshToken">>;
    appleSocialLogin(dto: AppleSocialLoginDto, request: Request, response: Response): Promise<import("./auth.service").AuthTokens | Omit<import("./auth.service").AuthTokens, "refreshToken">>;
    telegramSocialLoginV2(dto: TelegramSocialLoginDto, request: Request, response: Response): Promise<{
        status: "enrollment_required";
        enrollmentToken: string;
        expiresIn: number;
    } | Omit<{
        status: "authenticated";
    } & import("./auth.service").AuthTokens, "refreshToken">>;
    appleSocialLoginV2(dto: AppleSocialLoginDto, request: Request, response: Response): Promise<{
        status: "enrollment_required";
        enrollmentToken: string;
        expiresIn: number;
    } | Omit<{
        status: "authenticated";
    } & import("./auth.service").AuthTokens, "refreshToken">>;
    googleSocialLoginV2(dto: GoogleSocialLoginDto, request: Request, response: Response): Promise<{
        status: "enrollment_required";
        enrollmentToken: string;
        expiresIn: number;
    } | Omit<{
        status: "authenticated";
    } & import("./auth.service").AuthTokens, "refreshToken">>;
    completeSocialEnrollment(dto: CompleteSocialEnrollmentDto, request: Request, response: Response): Promise<Omit<{
        status: "authenticated";
    } & import("./auth.service").AuthTokens, "refreshToken">>;
    refresh(dto: RefreshDto, request: Request, response: Response): Promise<Omit<import("./auth.service").AuthTokens, "refreshToken">>;
    logout(dto: RefreshDto, request: Request, response: Response): Promise<void>;
    me(user: AuthPrincipal): AuthPrincipal;
}
