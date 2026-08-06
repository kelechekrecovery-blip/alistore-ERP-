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
exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const documents_service_1 = require("./documents.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
let DocumentsController = class DocumentsController {
    constructor(documents) {
        this.documents = documents;
    }
    orderInvoice(id) {
        return this.documents.orderInvoice(id);
    }
    tradeInContract(id) {
        return this.documents.tradeInContract(id);
    }
    warrantyTalon(imei) {
        return this.documents.warrantyTalon(imei);
    }
    writeOffActByApproval(approvalId) {
        return this.documents.writeOffActByApproval(approvalId);
    }
    writeOffAct(movementId) {
        return this.documents.writeOffAct(movementId);
    }
    returnAct(id) {
        return this.documents.returnAct(id);
    }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, common_1.Get)('order/:id/invoice'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "orderInvoice", null);
__decorate([
    (0, common_1.Get)('tradein/:id/contract'),
    (0, require_permission_decorator_1.RequirePermission)('pii', 'approve'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "tradeInContract", null);
__decorate([
    (0, common_1.Get)('warranty/:imei/talon'),
    __param(0, (0, common_1.Param)('imei')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "warrantyTalon", null);
__decorate([
    (0, common_1.Get)('writeoff/by-approval/:approvalId/act'),
    __param(0, (0, common_1.Param)('approvalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "writeOffActByApproval", null);
__decorate([
    (0, common_1.Get)('writeoff/:movementId/act'),
    __param(0, (0, common_1.Param)('movementId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "writeOffAct", null);
__decorate([
    (0, common_1.Get)('return/:id/act'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "returnAct", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, common_1.Controller)('documents'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    (0, require_permission_decorator_1.RequirePermission)('documents', 'read'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], DocumentsController);
//# sourceMappingURL=documents.controller.js.map