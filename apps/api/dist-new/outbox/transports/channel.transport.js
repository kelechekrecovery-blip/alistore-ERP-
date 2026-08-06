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
exports.ChannelNotificationTransport = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const email_transport_1 = require("./email.transport");
const expo_push_transport_1 = require("./expo-push.transport");
const fcm_push_transport_1 = require("./fcm-push.transport");
const log_transport_1 = require("./log.transport");
const novu_transport_1 = require("./novu.transport");
const telegram_bot_transport_1 = require("./telegram-bot.transport");
const whatsapp_cloud_transport_1 = require("./whatsapp-cloud.transport");
const prisma_service_1 = require("../../prisma/prisma.service");
let ChannelNotificationTransport = class ChannelNotificationTransport {
    constructor(config, prisma) {
        this.log = new log_transport_1.LogNotificationTransport();
        this.isProduction =
            config.get('NODE_ENV')?.trim().toLowerCase() === 'production';
        this.email = new email_transport_1.EmailNotificationTransport(config);
        if (prisma && hasConfig(config, 'EXPO_PUBLIC_EAS_PROJECT_ID')) {
            this.expoPush = new expo_push_transport_1.ExpoPushTransport(config, prisma);
        }
        if (prisma && (hasConfig(config, 'FCM_SERVICE_ACCOUNT_JSON') || hasConfig(config, 'FCM_SERVICE_ACCOUNT_KEY_PATH'))) {
            this.fcmPush = new fcm_push_transport_1.FcmPushTransport(config, prisma);
        }
        if (hasConfig(config, 'NOVU_API_KEY')) {
            this.novu = new novu_transport_1.NovuHttpTransport(config);
        }
        if (hasConfig(config, 'TELEGRAM_BOT_TOKEN')) {
            this.telegram = new telegram_bot_transport_1.TelegramBotTransport(config);
        }
        if (hasConfig(config, 'WHATSAPP_ACCESS_TOKEN') &&
            hasConfig(config, 'WHATSAPP_PHONE_NUMBER_ID')) {
            this.whatsapp = new whatsapp_cloud_transport_1.WhatsAppCloudTransport(config);
        }
    }
    deliver(message) {
        switch (message.channel) {
            case 'email':
                return this.email.deliver(message);
            case 'telegram':
                return (this.telegram ?? this.fallbackFor('telegram')).deliver(message);
            case 'whatsapp':
                return (this.whatsapp ?? this.fallbackFor('whatsapp')).deliver(message);
            case 'push': {
                const nativeTransports = [];
                if (this.fcmPush)
                    nativeTransports.push(this.fcmPush);
                if (this.expoPush)
                    nativeTransports.push(this.expoPush);
                if (nativeTransports.length > 0) {
                    return Promise.all(nativeTransports.map((transport) => transport.deliver(message))).then(() => undefined);
                }
                return (this.novu ?? this.fallbackFor('push')).deliver(message);
            }
            case 'sms':
            case 'webhook':
                return (this.novu ?? this.fallbackFor(message.channel)).deliver(message);
            default:
                return this.fallbackFor(message.channel).deliver(message);
        }
    }
    fallbackFor(channel) {
        if (this.isProduction) {
            return {
                deliver: async () => {
                    throw new Error(`No production notification provider configured for channel: ${channel}`);
                },
            };
        }
        return this.log;
    }
};
exports.ChannelNotificationTransport = ChannelNotificationTransport;
exports.ChannelNotificationTransport = ChannelNotificationTransport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService, prisma_service_1.PrismaService])
], ChannelNotificationTransport);
function hasConfig(config, key) {
    const value = config.get(key);
    return typeof value === 'string' && value.trim().length > 0;
}
//# sourceMappingURL=channel.transport.js.map