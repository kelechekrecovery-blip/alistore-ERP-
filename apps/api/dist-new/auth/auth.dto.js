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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompleteSocialEnrollmentDto = exports.GoogleSocialLoginDto = exports.AppleSocialLoginDto = exports.TelegramSocialLoginDto = exports.RefreshDto = exports.VerifyEmailOtpDto = exports.RequestEmailOtpDto = exports.VerifyOtpDto = exports.RequestOtpDto = void 0;
const class_validator_1 = require("class-validator");
const PHONE = /^\+?\d{9,15}$/;
class RequestOtpDto {
}
exports.RequestOtpDto = RequestOtpDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(PHONE, { message: 'phone must be 9-15 digits, optional leading +' }),
    __metadata("design:type", String)
], RequestOtpDto.prototype, "phone", void 0);
class VerifyOtpDto {
}
exports.VerifyOtpDto = VerifyOtpDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(PHONE),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6, { message: 'code must be 6 digits' }),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 64),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "challengeId", void 0);
class RequestEmailOtpDto {
}
exports.RequestEmailOtpDto = RequestEmailOtpDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], RequestEmailOtpDto.prototype, "email", void 0);
class VerifyEmailOtpDto extends RequestEmailOtpDto {
}
exports.VerifyEmailOtpDto = VerifyEmailOtpDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6, { message: 'code must be 6 digits' }),
    __metadata("design:type", String)
], VerifyEmailOtpDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(1, 64),
    __metadata("design:type", String)
], VerifyEmailOtpDto.prototype, "challengeId", void 0);
class RefreshDto {
}
exports.RefreshDto = RefreshDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefreshDto.prototype, "refreshToken", void 0);
class TelegramSocialLoginDto {
}
exports.TelegramSocialLoginDto = TelegramSocialLoginDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TelegramSocialLoginDto.prototype, "initData", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['mini_app', 'login_widget']),
    __metadata("design:type", String)
], TelegramSocialLoginDto.prototype, "source", void 0);
class AppleSocialLoginDto {
}
exports.AppleSocialLoginDto = AppleSocialLoginDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AppleSocialLoginDto.prototype, "identityToken", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AppleSocialLoginDto.prototype, "nonce", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AppleSocialLoginDto.prototype, "name", void 0);
class GoogleSocialLoginDto {
}
exports.GoogleSocialLoginDto = GoogleSocialLoginDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GoogleSocialLoginDto.prototype, "identityToken", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GoogleSocialLoginDto.prototype, "nonce", void 0);
class CompleteSocialEnrollmentDto extends VerifyOtpDto {
}
exports.CompleteSocialEnrollmentDto = CompleteSocialEnrollmentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(32, 256),
    __metadata("design:type", String)
], CompleteSocialEnrollmentDto.prototype, "enrollmentToken", void 0);
//# sourceMappingURL=auth.dto.js.map