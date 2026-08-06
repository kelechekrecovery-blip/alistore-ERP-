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
var AlerterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlerterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fetch_with_timeout_1 = require("../outbox/transports/fetch-with-timeout");
const DEFAULT_DEDUP_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_PER_WINDOW = 10;
const RECENT_LIMIT = 50;
const TEXT_LIMIT = 900;
const DELIVERY_TIMEOUT_MS = 5_000;
let AlerterService = AlerterService_1 = class AlerterService {
    constructor(config) {
        this.logger = new common_1.Logger(AlerterService_1.name);
        this.lastSentAtByKey = new Map();
        this.sentAtWindow = [];
        this.recent = [];
        this.suppressed = 0;
        this.apiUrl = (config.get('ALERT_TELEGRAM_API_URL') ?? 'https://api.telegram.org').replace(/\/$/, '');
        this.botToken = config.get('ALERT_TELEGRAM_BOT_TOKEN') ?? '';
        this.chatId = config.get('ALERT_TELEGRAM_CHAT_ID') ?? '';
        this.environment = config.get('NODE_ENV') ?? 'development';
        this.dedupWindowMs = this.positiveInt(config.get('ALERT_DEDUP_WINDOW_MS'), DEFAULT_DEDUP_WINDOW_MS);
        this.maxPerWindow = this.positiveInt(config.get('ALERT_MAX_PER_WINDOW'), DEFAULT_MAX_PER_WINDOW);
        this.enabled = Boolean(this.botToken && this.chatId);
        if (this.enabled) {
            this.logger.log('Telegram alert channel enabled');
        }
    }
    notifyCritical(alert) {
        const message = this.stableMessage(alert.message);
        const now = Date.now();
        if (this.isDuplicate(alert.source, message, now) || this.isRateCapped(now)) {
            this.suppressed += 1;
            return;
        }
        this.remember(alert.source, message, this.enabled, now);
        if (!this.enabled)
            return;
        void this.deliver(alert.source, message, alert.error).catch((err) => {
            this.logger.warn(`Alert delivery failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        });
    }
    async notifyCriticalAndWait(alert) {
        const message = this.stableMessage(alert.message);
        this.remember(alert.source, message, this.enabled, Date.now());
        if (!this.enabled)
            return;
        try {
            await this.deliver(alert.source, message, alert.error);
        }
        catch (err) {
            this.logger.warn(`Alert delivery failed: ${err instanceof Error ? err.message : 'unknown error'}`);
        }
    }
    recentAlerts(limit = 20) {
        return this.recent.slice(0, Math.max(0, limit));
    }
    get suppressedCount() {
        return this.suppressed;
    }
    async deliver(source, message, error) {
        const detail = error instanceof Error ? error.message : undefined;
        const text = [`🚨 [AliStore ${this.environment}] ${source}: ${message}`];
        if (detail && detail !== message)
            text.push(detail.slice(0, 300));
        const response = await (0, fetch_with_timeout_1.fetchWithTimeout)(`${this.apiUrl}/bot${this.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: this.chatId,
                text: text.join('\n').slice(0, TEXT_LIMIT),
                disable_web_page_preview: true,
            }),
        }, DELIVERY_TIMEOUT_MS);
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`.trim());
        }
    }
    isDuplicate(source, message, now) {
        const key = `${source}|${message}`;
        const last = this.lastSentAtByKey.get(key);
        if (last !== undefined && now - last < this.dedupWindowMs)
            return true;
        this.lastSentAtByKey.set(key, now);
        if (this.lastSentAtByKey.size > 500) {
            for (const [k, at] of this.lastSentAtByKey) {
                if (now - at >= this.dedupWindowMs)
                    this.lastSentAtByKey.delete(k);
            }
        }
        return false;
    }
    isRateCapped(now) {
        while (this.sentAtWindow.length > 0 && now - this.sentAtWindow[0] >= this.dedupWindowMs) {
            this.sentAtWindow.shift();
        }
        if (this.sentAtWindow.length >= this.maxPerWindow)
            return true;
        this.sentAtWindow.push(now);
        return false;
    }
    remember(source, message, delivered, now) {
        this.recent.unshift({
            at: new Date(now).toISOString(),
            source,
            message,
            delivered,
        });
        if (this.recent.length > RECENT_LIMIT)
            this.recent.length = RECENT_LIMIT;
    }
    stableMessage(message) {
        return message
            .split('?')[0]
            .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
            .replace(/\b\d{4,}\b/g, ':n')
            .slice(0, 500);
    }
    positiveInt(raw, fallback) {
        const value = Number(raw);
        return Number.isSafeInteger(value) && value > 0 ? value : fallback;
    }
};
exports.AlerterService = AlerterService;
exports.AlerterService = AlerterService = AlerterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AlerterService);
//# sourceMappingURL=alerter.service.js.map