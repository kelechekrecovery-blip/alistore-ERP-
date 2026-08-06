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
exports.SandboxPaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const payment_intents_service_1 = require("./payment-intents.service");
const sandbox_confirm_guard_1 = require("./sandbox-confirm.guard");
let SandboxPaymentsController = class SandboxPaymentsController {
    constructor(intents) {
        this.intents = intents;
    }
    page(provider, intentId, returnUrl, response) {
        response.type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AliStore Sandbox</title><style>body{font-family:system-ui;background:#16130f;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.box{width:min(420px,88vw);border:1px solid #342e28;padding:28px;background:#221e19;border-radius:8px}button{width:100%;padding:14px;border:0;border-radius:7px;background:#c8f04b;color:#16130f;font-weight:800}.muted{color:#a79c92;font-size:14px}</style></head>
<body><main class="box"><h1>Тестовая оплата</h1><p class="muted">Провайдер: ${escapeHtml(provider)}<br>Intent: ${escapeHtml(intentId)}</p>
<form method="post" action="/api/sandbox/payments/${encodeURIComponent(provider)}/${encodeURIComponent(intentId)}/confirm">
<input type="hidden" name="returnUrl" value="${escapeHtml(returnUrl ?? '')}"><button type="submit">Подтвердить оплату</button></form>
<p class="muted">Списание средств не производится.</p></main></body></html>`);
    }
    async confirm(intentId, body, response) {
        await this.intents.confirmSandboxIntent(intentId);
        const returnUrl = safeReturnUrl(body.returnUrl);
        if (returnUrl)
            return response.redirect(303, returnUrl);
        return response.type('html').send('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Оплачено</title><body><h1>Тестовая оплата подтверждена</h1><p>Вернитесь в AliStore.</p></body></html>');
    }
    confirmJson(provider, intentId) {
        return this.intents.confirmSandboxIntent(intentId, provider);
    }
};
exports.SandboxPaymentsController = SandboxPaymentsController;
__decorate([
    (0, common_1.Get)(':provider/:intentId'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Param)('intentId')),
    __param(2, (0, common_1.Query)('returnUrl')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], SandboxPaymentsController.prototype, "page", null);
__decorate([
    (0, common_1.Post)(':provider/:intentId/confirm'),
    (0, common_1.UseGuards)(sandbox_confirm_guard_1.SandboxConfirmGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, common_1.Param)('intentId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SandboxPaymentsController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':provider/:intentId/confirm-json'),
    (0, common_1.UseGuards)(sandbox_confirm_guard_1.SandboxConfirmGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Param)('intentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SandboxPaymentsController.prototype, "confirmJson", null);
exports.SandboxPaymentsController = SandboxPaymentsController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, common_1.Controller)('sandbox/payments'),
    __metadata("design:paramtypes", [payment_intents_service_1.PaymentIntentsService])
], SandboxPaymentsController);
function safeReturnUrl(value) {
    if (!value)
        return null;
    try {
        const url = new URL(value);
        if (url.protocol === 'alistore:' && url.hostname === 'payment-return' && !url.pathname)
            return value;
        if (url.protocol === 'https:' && ['ali.kg', 'www.ali.kg'].includes(url.hostname) && url.pathname === '/payment-return')
            return value;
    }
    catch {
        return null;
    }
    return null;
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
//# sourceMappingURL=sandbox-payments.controller.js.map