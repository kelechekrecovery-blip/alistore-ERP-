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
exports.LandedCostController = exports.SupplierStatementController = exports.SupplierAdvanceController = exports.SupplierCreditNoteController = exports.SupplierInvoiceController = exports.ProcurementController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const procurement_dto_1 = require("./procurement.dto");
const procurement_service_1 = require("./procurement.service");
let ProcurementController = class ProcurementController {
    constructor(procurement) {
        this.procurement = procurement;
    }
    list(status) {
        return this.procurement.list(status);
    }
    get(id) {
        return this.procurement.get(id);
    }
    create(user, dto) {
        return this.procurement.create(dto, user.customerId);
    }
    send(user, id) {
        return this.procurement.send(id, user.customerId);
    }
    cancel(user, id) {
        return this.procurement.cancel(id, user.customerId);
    }
    receive(user, id, dto) {
        return this.procurement.receive(id, dto, user.customerId);
    }
};
exports.ProcurementController = ProcurementController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, procurement_dto_1.CreatePurchaseOrderDto]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/send'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'send'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "send", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/receive'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, procurement_dto_1.ReceivePurchaseOrderDto]),
    __metadata("design:returntype", void 0)
], ProcurementController.prototype, "receive", null);
exports.ProcurementController = ProcurementController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/purchase-orders'),
    __metadata("design:paramtypes", [procurement_service_1.ProcurementService])
], ProcurementController);
let SupplierInvoiceController = class SupplierInvoiceController {
    constructor(procurement) {
        this.procurement = procurement;
    }
    list(status) {
        return this.procurement.listInvoices(status);
    }
    create(user, dto) {
        return this.procurement.createSupplierInvoice(dto, user.customerId);
    }
    approve(user, id) {
        return this.procurement.approveSupplierInvoice(id, user.customerId);
    }
    pay(user, id, dto) {
        return this.procurement.paySupplierInvoice(id, dto, user.customerId);
    }
    createPayment(user, id, dto) {
        return this.procurement.createSupplierInvoicePayment(id, dto, user.customerId);
    }
};
exports.SupplierInvoiceController = SupplierInvoiceController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupplierInvoiceController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, procurement_dto_1.CreateSupplierInvoiceDto]),
    __metadata("design:returntype", void 0)
], SupplierInvoiceController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'send'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupplierInvoiceController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/pay'),
    (0, require_permission_decorator_1.RequirePermission)('accounts_payable', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, procurement_dto_1.PaySupplierInvoiceDto]),
    __metadata("design:returntype", void 0)
], SupplierInvoiceController.prototype, "pay", null);
__decorate([
    (0, common_1.Post)(':id/payments'),
    (0, require_permission_decorator_1.RequirePermission)('accounts_payable', 'pay'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, procurement_dto_1.CreateSupplierInvoicePaymentDto]),
    __metadata("design:returntype", void 0)
], SupplierInvoiceController.prototype, "createPayment", null);
exports.SupplierInvoiceController = SupplierInvoiceController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supplier-invoices'),
    __metadata("design:paramtypes", [procurement_service_1.ProcurementService])
], SupplierInvoiceController);
let SupplierCreditNoteController = class SupplierCreditNoteController {
    constructor(procurement) {
        this.procurement = procurement;
    }
    list(supplierId) {
        return this.procurement.listCreditNotes(supplierId);
    }
    create(user, dto) {
        return this.procurement.createCreditNote(dto, user.customerId);
    }
    approve(user, id) {
        return this.procurement.approveCreditNote(id, user.customerId);
    }
    apply(user, id) {
        return this.procurement.applyCreditNote(id, user.customerId);
    }
};
exports.SupplierCreditNoteController = SupplierCreditNoteController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Query)('supplierId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupplierCreditNoteController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, procurement_dto_1.CreateSupplierCreditNoteDto]),
    __metadata("design:returntype", void 0)
], SupplierCreditNoteController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'send'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupplierCreditNoteController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)(':id/apply'),
    (0, require_permission_decorator_1.RequirePermission)('accounts_payable', 'apply'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupplierCreditNoteController.prototype, "apply", null);
exports.SupplierCreditNoteController = SupplierCreditNoteController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supplier-credit-notes'),
    __metadata("design:paramtypes", [procurement_service_1.ProcurementService])
], SupplierCreditNoteController);
let SupplierAdvanceController = class SupplierAdvanceController {
    constructor(procurement) {
        this.procurement = procurement;
    }
    list(supplierId) {
        return this.procurement.listSupplierAdvances(supplierId);
    }
    create(user, dto) {
        return this.procurement.createSupplierAdvance(dto, user.customerId);
    }
    apply(user, id, dto) {
        return this.procurement.applySupplierAdvance(id, dto, user.customerId);
    }
};
exports.SupplierAdvanceController = SupplierAdvanceController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Query)('supplierId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupplierAdvanceController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, procurement_dto_1.CreateSupplierAdvanceDto]),
    __metadata("design:returntype", void 0)
], SupplierAdvanceController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/apply'),
    (0, require_permission_decorator_1.RequirePermission)('accounts_payable', 'apply'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, procurement_dto_1.ApplySupplierAdvanceDto]),
    __metadata("design:returntype", void 0)
], SupplierAdvanceController.prototype, "apply", null);
exports.SupplierAdvanceController = SupplierAdvanceController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supplier-advances'),
    __metadata("design:paramtypes", [procurement_service_1.ProcurementService])
], SupplierAdvanceController);
let SupplierStatementController = class SupplierStatementController {
    constructor(procurement) {
        this.procurement = procurement;
    }
    list(supplierId) {
        return this.procurement.listSupplierStatements(supplierId);
    }
    import(user, dto) {
        return this.procurement.importSupplierStatement(dto, user.customerId);
    }
    reconcile(user, id, dto) {
        return this.procurement.reconcileSupplierStatementLine(id, dto, user.customerId);
    }
};
exports.SupplierStatementController = SupplierStatementController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Query)('supplierId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupplierStatementController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, procurement_dto_1.ImportSupplierStatementDto]),
    __metadata("design:returntype", void 0)
], SupplierStatementController.prototype, "import", null);
__decorate([
    (0, common_1.Post)('lines/:id/reconcile'),
    (0, require_permission_decorator_1.RequirePermission)('accounts_payable', 'reconcile'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, procurement_dto_1.ReconcileSupplierStatementLineDto]),
    __metadata("design:returntype", void 0)
], SupplierStatementController.prototype, "reconcile", null);
exports.SupplierStatementController = SupplierStatementController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/supplier-statements'),
    __metadata("design:paramtypes", [procurement_service_1.ProcurementService])
], SupplierStatementController);
let LandedCostController = class LandedCostController {
    constructor(procurement) {
        this.procurement = procurement;
    }
    list(purchaseOrderId) {
        return this.procurement.listLandedCosts(purchaseOrderId);
    }
    apply(user, dto) {
        return this.procurement.createLandedCost(dto, user.customerId);
    }
};
exports.LandedCostController = LandedCostController;
__decorate([
    (0, common_1.Get)(),
    (0, require_permission_decorator_1.RequirePermission)('procurement', 'read'),
    __param(0, (0, common_1.Query)('purchaseOrderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LandedCostController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, require_permission_decorator_1.RequirePermission)('landed_cost', 'post'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, procurement_dto_1.CreateLandedCostDto]),
    __metadata("design:returntype", void 0)
], LandedCostController.prototype, "apply", null);
exports.LandedCostController = LandedCostController = __decorate([
    (0, swagger_1.ApiTags)('procurement'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, common_1.Controller)('procurement/landed-costs'),
    __metadata("design:paramtypes", [procurement_service_1.ProcurementService])
], LandedCostController);
//# sourceMappingURL=procurement.controller.js.map