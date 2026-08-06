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
exports.WarrantyController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const authz_service_1 = require("../authz/authz.service");
const warranty_service_1 = require("./warranty.service");
const warranty_dto_1 = require("./warranty.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const optional_jwt_auth_guard_1 = require("../auth/optional-jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const guest_capability_1 = require("../auth/guest-capability");
const SYSTEM_ACTOR = 'system';
let WarrantyController = class WarrantyController {
    constructor(warranty, authz) {
        this.warranty = warranty;
        this.authz = authz;
    }
    list(customerId, imei, status) {
        return this.warranty.list({ customerId, imei, status });
    }
    async getOne(id) {
        const wc = await this.warranty.get(id);
        if (!wc)
            throw new common_1.NotFoundException(`Гарантия ${id} не найдена`);
        return wc;
    }
    async open(dto, user, capability, idempotencyKey) {
        if (user?.typ === 'customer' && dto.customerId !== user.customerId) {
            throw new common_1.ForbiddenException('Нельзя открыть гарантию от имени другого клиента');
        }
        const customerId = user?.typ === 'customer' ? user.customerId : dto.customerId;
        if (!user)
            (0, guest_capability_1.requireGuestCapability)(capability, 'warranty:create', customerId);
        if (user?.typ === 'staff') {
            if (!user.role || !(await this.authz.can(user.role, 'warranty', 'create'))) {
                throw new common_1.ForbiddenException('Недостаточно прав для приёма в гарантию');
            }
        }
        return this.warranty.open({ ...dto, customerId }, user ? user.customerId : SYSTEM_ACTOR, idempotencyKey);
    }
    transition(user, id, dto) {
        return this.warranty.transition(id, dto.status, user.customerId);
    }
};
exports.WarrantyController = WarrantyController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List warranty cases by customer / imei / status' }),
    (0, swagger_1.ApiQuery)({ name: 'customerId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'imei', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false }),
    (0, swagger_1.ApiOkResponse)({ description: 'Cases ordered by SLA (soonest first).' }),
    (0, common_1.Get)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('warranty', 'read'),
    __param(0, (0, common_1.Query)('customerId')),
    __param(1, (0, common_1.Query)('imei')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], WarrantyController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a warranty case' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Case does not exist.' }),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('warranty', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WarrantyController.prototype, "getOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open a warranty case (warranty.created, SLA set)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Case opened.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown device.' }),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard, throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('x-guest-capability')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [warranty_dto_1.OpenWarrantyDto, Object, String, String]),
    __metadata("design:returntype", Promise)
], WarrantyController.prototype, "open", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Advance a warranty case through its status machine' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Status updated.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Illegal transition.' }),
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('warranty', 'transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, warranty_dto_1.WarrantyStatusDto]),
    __metadata("design:returntype", void 0)
], WarrantyController.prototype, "transition", null);
exports.WarrantyController = WarrantyController = __decorate([
    (0, swagger_1.ApiTags)('warranty'),
    (0, common_1.Controller)('warranty'),
    __metadata("design:paramtypes", [warranty_service_1.WarrantyService,
        authz_service_1.AuthzService])
], WarrantyController);
//# sourceMappingURL=warranty.controller.js.map