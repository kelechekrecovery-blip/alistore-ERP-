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
exports.NovuHttpTransport = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fetch_with_timeout_1 = require("./fetch-with-timeout");
let NovuHttpTransport = class NovuHttpTransport {
    constructor(config) {
        this.apiUrl = config.get('NOVU_API_URL') ?? 'https://api.novu.co';
        this.apiKey = config.get('NOVU_API_KEY') ?? '';
    }
    async deliver(message) {
        const response = await (0, fetch_with_timeout_1.fetchWithTimeout)(`${this.apiUrl}/v1/events/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `ApiKey ${this.apiKey}`,
            },
            body: JSON.stringify({
                name: message.template,
                to: { subscriberId: message.recipient, phone: message.recipient },
                payload: message.payload ?? {},
            }),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Novu trigger failed: ${response.status} ${body}`.trim());
        }
    }
};
exports.NovuHttpTransport = NovuHttpTransport;
exports.NovuHttpTransport = NovuHttpTransport = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], NovuHttpTransport);
//# sourceMappingURL=novu.transport.js.map