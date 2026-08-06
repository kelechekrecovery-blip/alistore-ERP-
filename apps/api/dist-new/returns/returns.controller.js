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
exports.ReturnsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const returns_service_1 = require("./returns.service");
const returns_dto_1 = require("./returns.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let ReturnsController = class ReturnsController {
    constructor(returns) {
        this.returns = returns;
    }
    mine(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return this.returns.listByCustomer(user.customerId);
    }
    createMine(user, idempotencyKey, dto) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        const key = requireIdempotencyKey(idempotencyKey);
        return this.returns.request(dto.orderId, dto.reason, user.customerId, user.customerId, key, dto.items);
    }
    list(status) {
        return this.returns.list(status);
    }
    async get(id) {
        const ret = await this.returns.get(id);
        if (!ret)
            throw new common_1.NotFoundException(`Возврат ${id} не найден`);
        return ret;
    }
    create(user, dto) {
        if (user.typ !== 'customer') {
            throw new common_1.ForbiddenException('Требуется customer JWT');
        }
        return this.returns.request(dto.orderId, dto.reason, user.customerId, user.customerId, undefined, dto.items);
    }
    transition(user, id, dto) {
        return this.returns.transition(id, dto.status, user.customerId, dto.location);
    }
};
exports.ReturnsController = ReturnsController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List returns of the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOkResponse)({ description: "The current customer's returns, newest first." }),
    (0, common_1.Get)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "mine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open an idempotent return for the authenticated customer' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Customer-owned return created or replayed.' }),
    (0, common_1.Post)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, returns_dto_1.CreateMineReturnDto]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "createMine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List returns by status' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Returns, newest first.' }),
    (0, common_1.Get)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('returns', 'read'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a return' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Return does not exist.' }),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('returns', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReturnsController.prototype, "get", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open a return request (return.requested)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Return created.' }),
    (0, common_1.Post)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, returns_dto_1.CreateReturnDto]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Advance a return through its status machine' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Return status updated.' }),
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('returns', 'transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, returns_dto_1.ReturnStatusDto]),
    __metadata("design:returntype", void 0)
], ReturnsController.prototype, "transition", null);
exports.ReturnsController = ReturnsController = __decorate([
    (0, swagger_1.ApiTags)('returns'),
    (0, common_1.Controller)('returns'),
    __metadata("design:paramtypes", [returns_service_1.ReturnsService])
], ReturnsController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
//# sourceMappingURL=returns.controller.js.map