"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const otp_retention_service_1 = require("./otp-retention.service");
const totp_service_1 = require("./totp.service");
const jwt_strategy_1 = require("./jwt.strategy");
const jwt_secret_1 = require("./jwt-secret");
const auth_controller_1 = require("./auth.controller");
const optional_jwt_auth_guard_1 = require("./optional-jwt-auth.guard");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const otp_sender_1 = require("./otp-sender");
const otp_sender_selector_1 = require("./otp-sender-selector");
const email_otp_sender_1 = require("./email-otp.sender");
const smtp_email_otp_sender_1 = require("./smtp-email-otp.sender");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule,
            rate_limit_module_1.RateLimitModule,
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: (0, jwt_secret_1.resolveJwtSecret)(config),
                }),
            }),
        ],
        providers: [
            auth_service_1.AuthService,
            totp_service_1.TotpService,
            jwt_strategy_1.JwtStrategy,
            optional_jwt_auth_guard_1.OptionalJwtAuthGuard,
            otp_retention_service_1.OtpRetentionService,
            {
                provide: otp_sender_1.OTP_SENDER,
                inject: [config_1.ConfigService],
                useFactory: (config) => (0, otp_sender_selector_1.selectOtpSender)((name) => config.get(name)),
            },
            {
                provide: email_otp_sender_1.EMAIL_OTP_SENDER,
                inject: [config_1.ConfigService],
                useFactory: (config) => config.get('SMTP_HOST')
                    ? new smtp_email_otp_sender_1.SmtpEmailOtpSender(config)
                    : new email_otp_sender_1.NoopEmailOtpSender(),
            },
        ],
        controllers: [auth_controller_1.AuthController],
        exports: [auth_service_1.AuthService, totp_service_1.TotpService, optional_jwt_auth_guard_1.OptionalJwtAuthGuard],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map