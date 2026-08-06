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
exports.SupplyIntegrityController = exports.SupplierOffersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const supplier_offers_dto_1 = require("./supplier-offers.dto");
const supplier_offers_service_1 = require("./supplier-offers.service");
let SupplierOffersController = class SupplierOffersController {
    constructor(offers) {
        this.offers = offers;
    }
    get(productId) {
        return this.offers.getActive(productId);
    }
    replace(user, productId, dto) {
        return this.offers.replace(productId, dto, user.customerId);
    }
    deactivate(user, productId) {
        return this.offers.deactivate(productId, user.customerId);
    }
};
exports.SupplierOffersController = SupplierOffersController;
__decorate([
    (0, common_1.Get)(':productId'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupplierOffersController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(':productId'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('productId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, supplier_offers_dto_1.ReplaceSupplierOfferDto]),
    __metadata("design:returntype", void 0)
], SupplierOffersController.prototype, "replace", null);
__decorate([
    (0, common_1.Delete)(':productId'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('productId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupplierOffersController.prototype, "deactivate", null);
exports.SupplierOffersController = SupplierOffersController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supplier-offers'),
    __metadata("design:paramtypes", [supplier_offers_service_1.SupplierOffersService])
], SupplierOffersController);
let SupplyIntegrityController = class SupplyIntegrityController {
    constructor(offers) {
        this.offers = offers;
    }
    check(user) {
        return this.offers.integrity(user.customerId);
    }
};
exports.SupplyIntegrityController = SupplyIntegrityController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SupplyIntegrityController.prototype, "check", null);
exports.SupplyIntegrityController = SupplyIntegrityController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supply-integrity'),
    __metadata("design:paramtypes", [supplier_offers_service_1.SupplierOffersService])
], SupplyIntegrityController);
//# sourceMappingURL=supplier-offers.controller.js.map