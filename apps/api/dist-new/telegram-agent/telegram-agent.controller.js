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
exports.TelegramAgentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const telegram_agent_service_1 = require("./telegram-agent.service");
const telegram_agent_dto_1 = require("./telegram-agent.dto");
let TelegramAgentController = class TelegramAgentController {
    constructor(agent) {
        this.agent = agent;
    }
    createPairing(user, dto) {
        if (user.typ !== 'staff')
            throw new common_1.ForbiddenException('Требуется staff JWT');
        return this.agent.createPairing(user.customerId, dto.totpToken);
    }
    disconnect(user, dto) {
        if (user.typ !== 'staff')
            throw new common_1.ForbiddenException('Требуется staff JWT');
        return this.agent.disconnect(user.customerId, dto.totpToken);
    }
    webhook(secret, update) {
        return this.agent.handleWebhook(secret, update);
    }
};
exports.TelegramAgentController = TelegramAgentController;
__decorate([
    (0, common_1.Post)('pairing-code'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a one-time Telegram pairing code for the current admin/owner' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'One-time code, valid for ten minutes.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('telegram_agent', 'link'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_agent_dto_1.TelegramAgentStepUpDto]),
    __metadata("design:returntype", void 0)
], TelegramAgentController.prototype, "createPairing", null);
__decorate([
    (0, common_1.Delete)('link'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Disable the current staff Telegram link' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('telegram_agent', 'link'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, telegram_agent_dto_1.TelegramAgentStepUpDto]),
    __metadata("design:returntype", void 0)
], TelegramAgentController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Post)('webhook'),
    (0, swagger_1.ApiOperation)({ summary: 'Telegram Bot API webhook (secret-token protected)' }),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 600, ttl: 60_000 } }),
    __param(0, (0, common_1.Headers)('x-telegram-bot-api-secret-token')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TelegramAgentController.prototype, "webhook", null);
exports.TelegramAgentController = TelegramAgentController = __decorate([
    (0, swagger_1.ApiTags)('telegram-agent'),
    (0, common_1.Controller)('telegram-agent'),
    __metadata("design:paramtypes", [telegram_agent_service_1.TelegramAgentService])
], TelegramAgentController);
//# sourceMappingURL=telegram-agent.controller.js.map