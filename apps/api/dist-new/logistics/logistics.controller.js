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
exports.LogisticsController = exports.LogisticsPublicController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const logistics_dto_1 = require("./logistics.dto");
const logistics_service_1 = require("./logistics.service");
let LogisticsPublicController = class LogisticsPublicController {
    constructor(logistics) {
        this.logistics = logistics;
    }
    availability(query) { return this.logistics.availability(query.date, query.zoneId); }
    checkoutOptions(query) { return this.logistics.checkoutOptions(query.date); }
};
exports.LogisticsPublicController = LogisticsPublicController;
__decorate([
    (0, common_1.Get)('availability'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [logistics_dto_1.LogisticsDateQueryDto]),
    __metadata("design:returntype", void 0)
], LogisticsPublicController.prototype, "availability", null);
__decorate([
    (0, common_1.Get)('checkout-options'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [logistics_dto_1.LogisticsDateQueryDto]),
    __metadata("design:returntype", void 0)
], LogisticsPublicController.prototype, "checkoutOptions", null);
exports.LogisticsPublicController = LogisticsPublicController = __decorate([
    (0, swagger_1.ApiTags)('logistics'),
    (0, common_1.Controller)('logistics'),
    __metadata("design:paramtypes", [logistics_service_1.LogisticsService])
], LogisticsPublicController);
let LogisticsController = class LogisticsController {
    constructor(logistics) {
        this.logistics = logistics;
    }
    overview(query) { return this.logistics.overview(query.date); }
    createZone(user, key, dto) { return this.logistics.createZone(dto, user.customerId, key); }
    createSlot(user, key, dto) { return this.logistics.createSlot(dto, user.customerId, key); }
    createStorePoint(user, key, dto) { return this.logistics.createStorePoint(dto, user.customerId, key); }
    updateStorePoint(user, id, key, dto) { return this.logistics.updateStorePoint(id, dto, user.customerId, key); }
};
exports.LogisticsController = LogisticsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, require_permission_decorator_1.RequirePermission)('logistics', 'read'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [logistics_dto_1.LogisticsDateQueryDto]),
    __metadata("design:returntype", void 0)
], LogisticsController.prototype, "overview", null);
__decorate([
    (0, common_1.Post)('zones'),
    (0, require_permission_decorator_1.RequirePermission)('logistics', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, logistics_dto_1.CreateDeliveryZoneDto]),
    __metadata("design:returntype", void 0)
], LogisticsController.prototype, "createZone", null);
__decorate([
    (0, common_1.Post)('slots'),
    (0, require_permission_decorator_1.RequirePermission)('logistics', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, logistics_dto_1.CreateDeliverySlotDto]),
    __metadata("design:returntype", void 0)
], LogisticsController.prototype, "createSlot", null);
__decorate([
    (0, common_1.Post)('store-points'),
    (0, require_permission_decorator_1.RequirePermission)('logistics', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, logistics_dto_1.CreateStorePointDto]),
    __metadata("design:returntype", void 0)
], LogisticsController.prototype, "createStorePoint", null);
__decorate([
    (0, common_1.Patch)('store-points/:id'),
    (0, require_permission_decorator_1.RequirePermission)('logistics', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, logistics_dto_1.UpdateStorePointDto]),
    __metadata("design:returntype", void 0)
], LogisticsController.prototype, "updateStorePoint", null);
exports.LogisticsController = LogisticsController = __decorate([
    (0, swagger_1.ApiTags)('logistics'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('logistics'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [logistics_service_1.LogisticsService])
], LogisticsController);
//# sourceMappingURL=logistics.controller.js.map