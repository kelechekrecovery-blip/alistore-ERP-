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
exports.ProtectionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const protection_dto_1 = require("./protection.dto");
const protection_service_1 = require("./protection.service");
let ProtectionController = class ProtectionController {
    constructor(protection) {
        this.protection = protection;
    }
    mine(user) {
        return this.protection.mine(this.customerId(user));
    }
    request(user, dto) {
        return this.protection.request(this.customerId(user), dto);
    }
    accept(user, id) {
        return this.protection.accept(id, this.customerId(user));
    }
    list() {
        return this.protection.list();
    }
    update(user, id, dto) {
        return this.protection.update(id, dto, user.customerId);
    }
    customerId(user) {
        if (user.typ !== 'customer')
            throw new common_1.ForbiddenException('Требуется customer JWT');
        return user.customerId;
    }
};
exports.ProtectionController = ProtectionController;
__decorate([
    (0, common_1.Get)('mine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ProtectionController.prototype, "mine", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Protection request created and ledgered.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, protection_dto_1.RequestProtectionDto]),
    __metadata("design:returntype", void 0)
], ProtectionController.prototype, "request", null);
__decorate([
    (0, common_1.Patch)(':id/accept'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProtectionController.prototype, "accept", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('protection', 'read'),
    (0, swagger_1.ApiOperation)({ summary: 'Staff protection request queue' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProtectionController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('protection', 'update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, protection_dto_1.UpdateProtectionDto]),
    __metadata("design:returntype", void 0)
], ProtectionController.prototype, "update", null);
exports.ProtectionController = ProtectionController = __decorate([
    (0, swagger_1.ApiTags)('protection'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('protection/policies'),
    __metadata("design:paramtypes", [protection_service_1.ProtectionService])
], ProtectionController);
//# sourceMappingURL=protection.controller.js.map