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
exports.StoreOperationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const store_operations_service_1 = require("./store-operations.service");
const store_operations_dto_1 = require("./store-operations.dto");
let StoreOperationsController = class StoreOperationsController {
    constructor(operations) {
        this.operations = operations;
    }
    overview(user, query) { return this.operations.overview(query, user); }
    createChecklist(user, key, dto) { return this.operations.createChecklist(dto, user.customerId, key); }
    updateItem(user, id, code, key, dto) { return this.operations.updateItem(id, code, dto, user.customerId, key); }
    completeChecklist(user, id, key) { return this.operations.completeChecklist(id, user.customerId, key); }
    createIncident(user, key, dto) { return this.operations.createIncident(dto, user.customerId, key); }
    resolveIncident(user, id, key, dto) { return this.operations.resolveIncident(id, dto, user.customerId, key); }
};
exports.StoreOperationsController = StoreOperationsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, require_permission_decorator_1.RequirePermission)('store_operations', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, store_operations_dto_1.StoreOperationsQueryDto]),
    __metadata("design:returntype", void 0)
], StoreOperationsController.prototype, "overview", null);
__decorate([
    (0, common_1.Post)('checklists'),
    (0, require_permission_decorator_1.RequirePermission)('store_operations', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, store_operations_dto_1.CreateStoreChecklistDto]),
    __metadata("design:returntype", void 0)
], StoreOperationsController.prototype, "createChecklist", null);
__decorate([
    (0, common_1.Post)('checklists/:id/items/:code'),
    (0, require_permission_decorator_1.RequirePermission)('store_operations', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('code')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, store_operations_dto_1.UpdateChecklistItemDto]),
    __metadata("design:returntype", void 0)
], StoreOperationsController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Post)('checklists/:id/complete'),
    (0, require_permission_decorator_1.RequirePermission)('store_operations', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], StoreOperationsController.prototype, "completeChecklist", null);
__decorate([
    (0, common_1.Post)('incidents'),
    (0, require_permission_decorator_1.RequirePermission)('store_operations', 'manage'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, store_operations_dto_1.CreateStoreIncidentDto]),
    __metadata("design:returntype", void 0)
], StoreOperationsController.prototype, "createIncident", null);
__decorate([
    (0, common_1.Post)('incidents/:id/resolve'),
    (0, require_permission_decorator_1.RequirePermission)('store_operations', 'resolve'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, store_operations_dto_1.ResolveStoreIncidentDto]),
    __metadata("design:returntype", void 0)
], StoreOperationsController.prototype, "resolveIncident", null);
exports.StoreOperationsController = StoreOperationsController = __decorate([
    (0, swagger_1.ApiTags)('store-operations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('store-operations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [store_operations_service_1.StoreOperationsService])
], StoreOperationsController);
//# sourceMappingURL=store-operations.controller.js.map