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
exports.SmtpEmailOtpSender = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer_1 = require("nodemailer");
let SmtpEmailOtpSender = class SmtpEmailOtpSender {
    constructor(config) {
        this.name = 'smtp';
        this.from = config.get('SMTP_FROM') ?? 'AliStore <no-reply@ali.kg>';
        const host = config.get('SMTP_HOST');
        this.configured = Boolean(host);
        this.transporter = host
            ? (0, nodemailer_1.createTransport)({
                host,
                port: Number(config.get('SMTP_PORT') ?? 587),
                secure: config.get('SMTP_SECURE') === 'true',
                connectionTimeout: 3_000,
                greetingTimeout: 3_000,
                socketTimeout: 3_000,
                auth: config.get('SMTP_USER')
                    ? {
                        user: config.get('SMTP_USER'),
                        pass: config.get('SMTP_PASS') ?? '',
                    }
                    : undefined,
            })
            : (0, nodemailer_1.createTransport)({ jsonTransport: true });
    }
    assertOperational() {
        if (!this.configured) {
            throw new Error('SMTP_HOST is not configured; email OTP cannot be delivered');
        }
    }
    buildMail(input) {
        const minutes = Math.max(1, Math.round(input.expiresInSeconds / 60));
        const subject = input.purpose === 'email_attach'
            ? 'AliStore — подтверждение адреса'
            : 'AliStore — код для входа';
        const action = input.purpose === 'email_attach'
            ? 'Код для привязки этого адреса к аккаунту AliStore'
            : 'Код для входа в AliStore';
        return {
            from: this.from,
            to: input.email,
            subject,
            text: [
                `${action}: ${input.code}`,
                `Код действует ${minutes} мин.`,
                'Если вы не запрашивали код — просто проигнорируйте это письмо.',
            ].join('\n'),
        };
    }
    async send(input) {
        await this.transporter.sendMail(this.buildMail(input));
    }
};
exports.SmtpEmailOtpSender = SmtpEmailOtpSender;
exports.SmtpEmailOtpSender = SmtpEmailOtpSender = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SmtpEmailOtpSender);
//# sourceMappingURL=smtp-email-otp.sender.js.map