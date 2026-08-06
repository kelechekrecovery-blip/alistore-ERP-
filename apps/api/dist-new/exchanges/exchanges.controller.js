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
exports.ExchangesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const exchanges_service_1 = require("./exchanges.service");
const exchanges_dto_1 = require("./exchanges.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let ExchangesController = class ExchangesController {
    constructor(exchanges) {
        this.exchanges = exchanges;
    }
    exchange(user, idempotencyKey, dto) {
        const key = idempotencyKey?.trim();
        if (!key)
            throw new common_1.BadRequestException('Idempotency-Key обязателен');
        if (key.length > 128)
            throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
        return this.exchanges.request(dto, user.customerId, key);
    }
};
exports.ExchangesController = ExchangesController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Park an exact exchange snapshot for evidence and senior approval' }),
    (0, swagger_1.ApiAcceptedResponse)({ description: 'Exchange request created; no money or stock changed.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Old unit not sold, or no stock for the new device.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order/item/product, or cheaper exchange.' }),
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('exchanges', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, exchanges_dto_1.ExchangeDto]),
    __metadata("design:returntype", void 0)
], ExchangesController.prototype, "exchange", null);
exports.ExchangesController = ExchangesController = __decorate([
    (0, swagger_1.ApiTags)('exchanges'),
    (0, common_1.Controller)('exchanges'),
    __metadata("design:paramtypes", [exchanges_service_1.ExchangesService])
], ExchangesController);
//# sourceMappingURL=exchanges.controller.js.map