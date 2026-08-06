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
exports.SuppliersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const supplier_rma_service_1 = require("./supplier-rma.service");
const suppliers_dto_1 = require("./suppliers.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
let SuppliersController = class SuppliersController {
    constructor(rma) {
        this.rma = rma;
    }
    createSupplier(dto) {
        return this.rma.createSupplier(dto);
    }
    listSuppliers() {
        return this.rma.listSuppliers();
    }
    scorecard() {
        return this.rma.scorecard();
    }
    openRma(user, dto) {
        return this.rma.open(dto, user.customerId);
    }
    listRmas(supplierId, status) {
        return this.rma.listRmas({ supplierId, status });
    }
    transition(user, id, dto) {
        return this.rma.transition(id, dto.to, user.customerId);
    }
};
exports.SuppliersController = SuppliersController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Register a supplier' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Supplier created.' }),
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('suppliers', 'create'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [suppliers_dto_1.CreateSupplierDto]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "createSupplier", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List suppliers' }),
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('suppliers', 'read'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "listSuppliers", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Supplier scorecard — volume, resolution rate, open backlog' }),
    (0, swagger_1.ApiOkResponse)({ description: 'One score row per supplier.' }),
    (0, common_1.Get)('scorecard'),
    (0, require_permission_decorator_1.RequirePermission)('suppliers', 'scorecard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "scorecard", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Open an RMA for a defective unit (unit → in_repair, rma.opened)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'RMA opened; ledger event written.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown supplier or unit.' }),
    (0, common_1.Post)('rma'),
    (0, require_permission_decorator_1.RequirePermission)('suppliers', 'rma_open'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, suppliers_dto_1.OpenRmaDto]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "openRma", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List RMAs (filter by supplierId/status)' }),
    (0, common_1.Get)('rma'),
    (0, require_permission_decorator_1.RequirePermission)('suppliers', 'rma_read'),
    __param(0, (0, common_1.Query)('supplierId')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "listRmas", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Advance an RMA through its status machine' }),
    (0, swagger_1.ApiOkResponse)({ description: 'RMA transitioned.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Illegal transition.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown RMA.' }),
    (0, common_1.Patch)('rma/:id/transition'),
    (0, require_permission_decorator_1.RequirePermission)('suppliers', 'rma_transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, suppliers_dto_1.RmaTransitionDto]),
    __metadata("design:returntype", void 0)
], SuppliersController.prototype, "transition", null);
exports.SuppliersController = SuppliersController = __decorate([
    (0, swagger_1.ApiTags)('suppliers'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('suppliers'),
    __metadata("design:paramtypes", [supplier_rma_service_1.SupplierRmaService])
], SuppliersController);
//# sourceMappingURL=suppliers.controller.js.map