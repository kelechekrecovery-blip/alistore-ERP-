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
exports.ExpoPushTransport = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const fetch_with_timeout_1 = require("./fetch-with-timeout");
const EXPO_PUSH_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
let ExpoPushTransport = class ExpoPushTransport {
    constructor(config, prisma) {
        this.prisma = prisma;
        this.apiUrl = config.get('EXPO_PUSH_API_URL') ?? 'https://exp.host/--/api/v2/push/send';
        this.accessToken = config.get('EXPO_PUSH_ACCESS_TOKEN')?.trim() || undefined;
    }
    async deliver(message) {
        const tokens = await this.resolveTokens(message.recipient);
        if (tokens.length === 0) {
            throw new Error(`push_recipient_unavailable: no active Expo tokens for ${message.recipient}`);
        }
        const payload = jsonObject(message.payload);
        const response = await (0, fetch_with_timeout_1.fetchWithTimeout)(this.apiUrl, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
                ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
            },
            body: JSON.stringify(tokens.map((token) => this.toExpoMessage(token, message, payload))),
        });
        const body = await readExpoResponse(response);
        if (!response.ok || body.errors?.length) {
            throw new Error(`Expo push send failed: ${response.status} ${JSON.stringify(body.errors ?? body)}`);
        }
        const tickets = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
        const retryableErrors = [];
        for (let index = 0; index < tickets.length; index += 1) {
            const ticket = tickets[index];
            if (ticket?.status !== 'error')
                continue;
            const token = tokens[index];
            if (ticket.details?.error === 'DeviceNotRegistered') {
                await this.disableToken(token);
            }
            else {
                retryableErrors.push(ticket.message ?? ticket.details?.error ?? 'unknown Expo push ticket error');
            }
        }
        if (retryableErrors.length > 0) {
            throw new Error(`Expo push ticket failed: ${retryableErrors.join('; ')}`);
        }
    }
    async resolveTokens(recipient) {
        if (EXPO_PUSH_TOKEN.test(recipient))
            return [recipient];
        const rows = await this.prisma.pushToken.findMany({
            where: {
                enabled: true,
                OR: [
                    { customerId: recipient },
                    { staffId: recipient },
                ],
            },
            select: { token: true },
            orderBy: { lastSeenAt: 'desc' },
            take: 100,
        });
        return rows.map((row) => row.token).filter((token) => EXPO_PUSH_TOKEN.test(token));
    }
    toExpoMessage(token, message, payload) {
        return {
            to: token,
            title: text(payload.title) ?? 'AliStore',
            body: text(payload.message) ?? text(payload.body) ?? titleFor(message.template),
            data: {
                ...payload,
                template: message.template,
                recipient: message.recipient,
            },
            sound: 'default',
            priority: 'default',
            channelId: 'orders',
        };
    }
    async disableToken(token) {
        await this.prisma.pushToken.updateMany({
            where: { token },
            data: { enabled: false },
        });
    }
};
exports.ExpoPushTransport = ExpoPushTransport;
exports.ExpoPushTransport = ExpoPushTransport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], ExpoPushTransport);
async function readExpoResponse(response) {
    const text = await response.text().catch(() => '');
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return { errors: [{ message: text }] };
    }
}
function jsonObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function text(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
function titleFor(template) {
    return template
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
        .join(' ');
}
//# sourceMappingURL=expo-push.transport.js.map