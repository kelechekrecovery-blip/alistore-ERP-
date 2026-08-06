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
exports.GiftcardsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const giftcards_service_1 = require("./giftcards.service");
const giftcards_dto_1 = require("./giftcards.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let GiftcardsController = class GiftcardsController {
    constructor(giftcards) {
        this.giftcards = giftcards;
    }
    issue(user, dto, idempotencyKey) {
        return this.giftcards.issue(dto, user.customerId, requireIdempotencyKey(idempotencyKey));
    }
    get(code) {
        return this.giftcards.getByCode(code);
    }
};
exports.GiftcardsController = GiftcardsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Issue a gift card / store-credit balance' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Gift card issued and ledger event written.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Code already exists.' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('giftcards', 'issue'),
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, giftcards_dto_1.IssueGiftCardDto, Object]),
    __metadata("design:returntype", void 0)
], GiftcardsController.prototype, "issue", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Check gift-card balance by code' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Gift card balance and redeemable status.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown gift-card code.' }),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    (0, common_1.Get)(':code'),
    __param(0, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GiftcardsController.prototype, "get", null);
exports.GiftcardsController = GiftcardsController = __decorate([
    (0, swagger_1.ApiTags)('giftcards'),
    (0, common_1.Controller)('giftcards'),
    __metadata("design:paramtypes", [giftcards_service_1.GiftcardsService])
], GiftcardsController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
//# sourceMappingURL=giftcards.controller.js.map