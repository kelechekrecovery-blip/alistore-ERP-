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
exports.SupplyQuarantineController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const errors_1 = require("../common/errors");
const supply_quarantine_dto_1 = require("./supply-quarantine.dto");
const supply_quarantine_service_1 = require("./supply-quarantine.service");
let SupplyQuarantineController = class SupplyQuarantineController {
    constructor(quarantines) {
        this.quarantines = quarantines;
    }
    propose(user, orderItemId, idempotencyKey, dto) {
        return this.quarantines.propose(orderItemId, dto, user.customerId, requiredIdempotencyKey(idempotencyKey));
    }
    resolve(user, id, idempotencyKey, dto) {
        return this.quarantines.resolve(id, dto, user.customerId, user.role, requiredIdempotencyKey(idempotencyKey));
    }
};
exports.SupplyQuarantineController = SupplyQuarantineController;
__decorate([
    (0, common_1.Post)('order-items/:orderItemId'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('orderItemId')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, supply_quarantine_dto_1.ProposeSupplyQuarantineDto]),
    __metadata("design:returntype", void 0)
], SupplyQuarantineController.prototype, "propose", null);
__decorate([
    (0, common_1.Post)(':id/resolve'),
    (0, require_permission_decorator_1.RequirePermission)('supply_quarantine', 'resolve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, supply_quarantine_dto_1.ResolveSupplyQuarantineDto]),
    __metadata("design:returntype", void 0)
], SupplyQuarantineController.prototype, "resolve", null);
exports.SupplyQuarantineController = SupplyQuarantineController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supply-quarantines'),
    __metadata("design:paramtypes", [supply_quarantine_service_1.SupplyQuarantineService])
], SupplyQuarantineController);
function requiredIdempotencyKey(value) {
    const normalized = value?.trim();
    if (!normalized || normalized.length > 128) {
        throw new errors_1.ValidationError('idempotency_key_required', 'Требуется заголовок Idempotency-Key длиной до 128 символов');
    }
    return normalized;
}
//# sourceMappingURL=supply-quarantine.controller.js.map