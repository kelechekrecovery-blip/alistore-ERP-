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
exports.EmailNotificationTransport = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer_1 = require("nodemailer");
let EmailNotificationTransport = class EmailNotificationTransport {
    constructor(config) {
        this.from =
            config.get('SMTP_FROM') ?? 'AliStore <no-reply@ali.kg>';
        const host = config.get('SMTP_HOST');
        this.isProduction =
            config.get('NODE_ENV')?.trim().toLowerCase() === 'production';
        this.smtpConfigured = Boolean(host?.trim());
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
    buildMail(message) {
        return {
            from: this.from,
            to: message.recipient,
            subject: `AliStore — ${message.template}`,
            text: `Событие: ${message.template}\n${JSON.stringify(message.payload ?? {}, null, 2)}`,
        };
    }
    async deliver(message) {
        if (this.isProduction && !this.smtpConfigured) {
            throw new Error('SMTP_HOST is not configured; production email delivery is disabled');
        }
        await this.transporter.sendMail(this.buildMail(message));
    }
};
exports.EmailNotificationTransport = EmailNotificationTransport;
exports.EmailNotificationTransport = EmailNotificationTransport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailNotificationTransport);
//# sourceMappingURL=email.transport.js.map