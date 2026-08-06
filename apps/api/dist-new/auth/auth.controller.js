"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const auth_service_1 = require("./auth.service");
const auth_dto_1 = require("./auth.dto");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const web_session_1 = require("./web-session");
let AuthController = class AuthController {
    constructor(auth) {
        this.auth = auth;
    }
    methods() {
        return this.auth.describeAuthMethods();
    }
    requestOtp(dto) {
        return this.auth.requestOtp(dto.phone, 'login');
    }
    async verifyOtp(dto, request, response) {
        const tokens = await this.auth.verifyOtp(dto.phone, dto.code, dto.challengeId);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.setWebSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        return (0, web_session_1.webAuthResponse)(request, tokens);
    }
    requestRecovery(dto) {
        return this.auth.requestRecoveryOtp(dto.phone);
    }
    async verifyRecovery(dto, request, response) {
        const tokens = await this.auth.verifyRecoveryOtp(dto.phone, dto.code, dto.challengeId);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.setWebSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        return (0, web_session_1.webAuthResponse)(request, tokens);
    }
    requestEmailOtp(dto) {
        return this.auth.requestEmailOtp(dto.email);
    }
    async verifyEmailOtp(dto, request, response) {
        const tokens = await this.auth.verifyEmailOtp(dto.email, dto.code, dto.challengeId);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.setWebSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        return (0, web_session_1.webAuthResponse)(request, tokens);
    }
    requestEmailAttach(user, dto) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return this.auth.requestEmailAttach(user.customerId, dto.email);
    }
    confirmEmailAttach(user, dto) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return this.auth.confirmEmailAttach(user.customerId, dto.email, dto.code, dto.challengeId);
    }
    async telegramSocialLogin(dto, request, response) {
        const tokens = await this.auth.loginWithTelegram(dto);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.setWebSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        return (0, web_session_1.webAuthResponse)(request, tokens);
    }
    async appleSocialLogin(dto, request, response) {
        const tokens = await this.auth.loginWithApple(dto);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.setWebSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        return (0, web_session_1.webAuthResponse)(request, tokens);
    }
    async telegramSocialLoginV2(dto, request, response) {
        const result = await this.auth.loginWithTelegramV2(dto);
        if (result.status === 'authenticated' && (0, web_session_1.isWebSessionRequest)(request)) {
            (0, web_session_1.setWebSessionCookies)(response, result, process.env.NODE_ENV === 'production');
            return (0, web_session_1.webAuthResponse)(request, result);
        }
        return result;
    }
    async appleSocialLoginV2(dto, request, response) {
        const result = await this.auth.loginWithAppleV2(dto);
        if (result.status === 'authenticated' && (0, web_session_1.isWebSessionRequest)(request)) {
            (0, web_session_1.setWebSessionCookies)(response, result, process.env.NODE_ENV === 'production');
            return (0, web_session_1.webAuthResponse)(request, result);
        }
        return result;
    }
    async googleSocialLoginV2(dto, request, response) {
        const result = await this.auth.loginWithGoogleV2(dto);
        if (result.status === 'authenticated' && (0, web_session_1.isWebSessionRequest)(request)) {
            (0, web_session_1.setWebSessionCookies)(response, result, process.env.NODE_ENV === 'production');
            return (0, web_session_1.webAuthResponse)(request, result);
        }
        return result;
    }
    async completeSocialEnrollment(dto, request, response) {
        const result = await this.auth.completeSocialEnrollment(dto);
        if ((0, web_session_1.isWebSessionRequest)(request)) {
            (0, web_session_1.setWebSessionCookies)(response, result, process.env.NODE_ENV === 'production');
            return (0, web_session_1.webAuthResponse)(request, result);
        }
        return result;
    }
    async refresh(dto, request, response) {
        const refreshToken = dto.refreshToken?.trim() || (0, web_session_1.readWebCookie)(request, web_session_1.WEB_REFRESH_COOKIE);
        if (!refreshToken)
            return this.auth.refresh('');
        const tokens = await this.auth.refresh(refreshToken);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.setWebSessionCookies)(response, tokens, process.env.NODE_ENV === 'production');
        return (0, web_session_1.webAuthResponse)(request, tokens);
    }
    async logout(dto, request, response) {
        const refreshToken = dto.refreshToken?.trim() || (0, web_session_1.readWebCookie)(request, web_session_1.WEB_REFRESH_COOKIE);
        if (refreshToken)
            await this.auth.logout(refreshToken);
        if ((0, web_session_1.isWebSessionRequest)(request))
            (0, web_session_1.clearWebSessionCookies)(response, process.env.NODE_ENV === 'production');
    }
    me(user) {
        return user;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('methods'),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "methods", null);
__decorate([
    (0, common_1.Post)('otp/request'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RequestOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestOtp", null);
__decorate([
    (0, common_1.Post)('otp/verify'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.VerifyOtpDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.Post)('recovery/request'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RequestOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestRecovery", null);
__decorate([
    (0, common_1.Post)('recovery/verify'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.VerifyOtpDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyRecovery", null);
__decorate([
    (0, common_1.Post)('email/request'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RequestEmailOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestEmailOtp", null);
__decorate([
    (0, common_1.Post)('email/verify'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.VerifyEmailOtpDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyEmailOtp", null);
__decorate([
    (0, common_1.Post)('email/attach/request'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, auth_dto_1.RequestEmailOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestEmailAttach", null);
__decorate([
    (0, common_1.Post)('email/attach/confirm'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, auth_dto_1.VerifyEmailOtpDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "confirmEmailAttach", null);
__decorate([
    (0, common_1.Post)('social/telegram'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.TelegramSocialLoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "telegramSocialLogin", null);
__decorate([
    (0, common_1.Post)('social/apple'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.AppleSocialLoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "appleSocialLogin", null);
__decorate([
    (0, common_1.Post)('v2/social/telegram'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.TelegramSocialLoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "telegramSocialLoginV2", null);
__decorate([
    (0, common_1.Post)('v2/social/apple'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.AppleSocialLoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "appleSocialLoginV2", null);
__decorate([
    (0, common_1.Post)('v2/social/google'),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.GoogleSocialLoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleSocialLoginV2", null);
__decorate([
    (0, common_1.Post)('v2/social/enrollment/complete'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.CompleteSocialEnrollmentDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "completeSocialEnrollment", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map