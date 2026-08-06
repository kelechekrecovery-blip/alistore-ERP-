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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundWebhooksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const payment_gateway_provider_1 = require("../payments/payment-gateway-provider");
const refunds_processor_1 = require("./refunds.processor");
let RefundWebhooksController = class RefundWebhooksController {
    constructor(gateway, processor) {
        this.gateway = gateway;
        this.processor = processor;
    }
    async receive(request, headers, body) {
        const payload = await this.gateway.verifyRefundWebhook({
            payload: body,
            rawBody: request.rawBody,
            headers,
        });
        await this.processor.reconcileProviderRefund(payload, 'system:refund-provider-webhook');
        return { accepted: true };
    }
};
exports.RefundWebhooksController = RefundWebhooksController;
__decorate([
    (0, common_1.Post)('provider'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60_000 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], RefundWebhooksController.prototype, "receive", null);
exports.RefundWebhooksController = RefundWebhooksController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, common_1.Controller)('refunds/webhooks'),
    __param(0, (0, common_1.Inject)(payment_gateway_provider_1.PAYMENT_GATEWAY_PROVIDER)),
    __metadata("design:paramtypes", [Object, refunds_processor_1.RefundProcessor])
], RefundWebhooksController);
//# sourceMappingURL=refund-webhooks.controller.js.map