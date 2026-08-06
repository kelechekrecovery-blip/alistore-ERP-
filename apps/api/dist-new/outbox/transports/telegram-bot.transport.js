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
exports.TelegramBotTransport = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const message_text_1 = require("./message-text");
let TelegramBotTransport = class TelegramBotTransport {
    constructor(config) {
        this.apiUrl = (config.get('TELEGRAM_API_URL') ?? 'https://api.telegram.org').replace(/\/$/, '');
        this.botToken = config.get('TELEGRAM_BOT_TOKEN') ?? '';
        const configuredTimeout = Number(config.get('TELEGRAM_REQUEST_TIMEOUT_MS') ?? 3_000);
        this.timeoutMs = Number.isFinite(configuredTimeout)
            ? Math.min(4_000, Math.max(1_000, configuredTimeout))
            : 3_000;
    }
    async deliver(message) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.apiUrl}/bot${this.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: message.recipient,
                    text: (0, message_text_1.notificationText)(message),
                    disable_web_page_preview: true,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`.trim());
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
};
exports.TelegramBotTransport = TelegramBotTransport;
exports.TelegramBotTransport = TelegramBotTransport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TelegramBotTransport);
//# sourceMappingURL=telegram-bot.transport.js.map