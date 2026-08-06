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
exports.WhatsAppCloudTransport = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const message_text_1 = require("./message-text");
const fetch_with_timeout_1 = require("./fetch-with-timeout");
let WhatsAppCloudTransport = class WhatsAppCloudTransport {
    constructor(config) {
        this.apiUrl = (config.get('WHATSAPP_API_URL') ?? 'https://graph.facebook.com').replace(/\/$/, '');
        this.apiVersion = config.get('WHATSAPP_API_VERSION') ?? 'v20.0';
        this.accessToken = config.get('WHATSAPP_ACCESS_TOKEN') ?? '';
        this.phoneNumberId = config.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    }
    async deliver(message) {
        const response = await (0, fetch_with_timeout_1.fetchWithTimeout)(`${this.apiUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.accessToken}`,
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: whatsappRecipient(message.recipient),
                type: 'text',
                text: { body: (0, message_text_1.notificationText)(message) },
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`WhatsApp message failed: ${response.status} ${body}`.trim());
        }
    }
};
exports.WhatsAppCloudTransport = WhatsAppCloudTransport;
exports.WhatsAppCloudTransport = WhatsAppCloudTransport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WhatsAppCloudTransport);
function whatsappRecipient(recipient) {
    return recipient.replace(/\D/g, '');
}
//# sourceMappingURL=whatsapp-cloud.transport.js.map