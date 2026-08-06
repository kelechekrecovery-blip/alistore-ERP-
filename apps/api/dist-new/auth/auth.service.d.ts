import { type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppleSocialLoginDto, CompleteSocialEnrollmentDto, GoogleSocialLoginDto, TelegramSocialLoginDto } from './auth.dto';
import { type AuthMethodsView } from './auth-methods';
import { OtpSender } from './otp-sender';
import { EmailOtpSender } from './email-otp.sender';
import type { AuthPrincipal } from './jwt.strategy';
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: string;
}
export type SocialAuthResult = ({
    status: 'authenticated';
} & AuthTokens) | {
    status: 'enrollment_required';
    enrollmentToken: string;
    expiresIn: number;
};
type PhoneOtpPurpose = 'login' | 'recovery';
export declare class AuthService implements OnModuleInit {
    private readonly prisma;
    private readonly jwt;
    private readonly config;
    private readonly otpSender;
    private readonly emailOtpSender;
    private readonly logger;
    constructor(prisma: PrismaService, jwt: JwtService, config: ConfigService, otpSender?: OtpSender, emailOtpSender?: EmailOtpSender);
    onModuleInit(): void;
    describeAuthMethods(): AuthMethodsView;
    verifyAccessToken(token: string): Promise<AuthPrincipal>;
    requestOtp(rawPhone: string, purpose?: PhoneOtpPurpose): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    requestRecoveryOtp(rawPhone: string): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    requestEmailOtp(email: string): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    verifyEmailOtp(email: string, code: string, challengeId?: string): Promise<AuthTokens>;
    requestEmailAttach(customerId: string, email: string): Promise<{
        challengeId: string;
        devCode?: string;
    }>;
    confirmEmailAttach(customerId: string, email: string, code: string, challengeId?: string): Promise<void>;
    private issueEmailChallenge;
    private consumeEmailOtp;
    private claimEmailOtp;
    private consumeEmailClaim;
    verifyOtp(rawPhone: string, code: string, challengeId?: string): Promise<AuthTokens>;
    private reviewOtpForPhone;
    private authenticateReviewLogin;
    private auditReviewLogin;
    verifyRecoveryOtp(rawPhone: string, code: string, challengeId?: string): Promise<AuthTokens>;
    loginWithTelegram(dto: TelegramSocialLoginDto): Promise<AuthTokens>;
    loginWithTelegramV2(dto: TelegramSocialLoginDto): Promise<SocialAuthResult>;
    private verifyTelegramProfile;
    loginWithApple(dto: AppleSocialLoginDto): Promise<AuthTokens>;
    loginWithAppleV2(dto: AppleSocialLoginDto): Promise<SocialAuthResult>;
    loginWithGoogleV2(dto: GoogleSocialLoginDto): Promise<SocialAuthResult>;
    private verifyAppleProfile;
    private resolveSocialV2;
    completeSocialEnrollment(dto: CompleteSocialEnrollmentDto): Promise<{
        status: 'authenticated';
    } & AuthTokens>;
    private socialEnrollmentTtlSeconds;
    private reserveConsumedSocialAssertion;
    private deleteExpiredSocialAssertions;
    private assertRecoveryRolloutEnabled;
    private claimPhoneOtp;
    private consumeClaimOnTx;
    private customerByCanonicalPhoneOnTx;
    refresh(refreshToken: string): Promise<AuthTokens>;
    logout(refreshToken: string): Promise<void>;
    private existingCustomerForSocialProfile;
    private issueTokens;
    private issueDerivedRefreshTokens;
    private refreshRotationGraceEnabled;
    private hashToken;
}
export {};
