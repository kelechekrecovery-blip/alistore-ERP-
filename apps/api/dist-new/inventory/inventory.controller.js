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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const inventory_service_1 = require("./inventory.service");
const inventory_dto_1 = require("./inventory.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const staff_auth_service_1 = require("../staff-auth/staff-auth.service");
const staff_principal_1 = require("../auth/staff-principal");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
let InventoryController = class InventoryController {
    constructor(inventory, staffAuth) {
        this.inventory = inventory;
        this.staffAuth = staffAuth;
    }
    async movement(user, dto, idempotencyKey) {
        return this.inventory.movement(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth), idempotencyKey);
    }
    async receive(user, dto) {
        return this.inventory.receive(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async receiveQuantity(user, dto) {
        return this.inventory.receiveQuantity(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async receiveConsignment(user, dto) {
        return this.inventory.receiveConsignment(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async receiveQuantityConsignment(user, dto) {
        return this.inventory.receiveQuantityConsignment(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async listConsignments(user) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.listConsignments();
    }
    async listQuantityConsignments(user) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.listQuantityConsignments();
    }
    async listConsignmentPayouts(user) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.listConsignmentPayouts();
    }
    async listConsignmentAdjustments(user) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.listConsignmentAdjustments();
    }
    async createConsignmentPayout(user, dto) {
        return this.inventory.createConsignmentPayout(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async payConsignmentPayout(user, id, dto) {
        return this.inventory.payConsignmentPayout(id, dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async transfer(user, dto) {
        return this.inventory.transfer(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async transferQuantity(user, dto) {
        return this.inventory.transferQuantity(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async count(user, dto, idempotencyKey) {
        return this.inventory.count(dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth), idempotencyKey);
    }
    async valuationReconciliation(user) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.valuationReconciliation();
    }
    async valuationRollForward(user, query) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.valuationRollForward(query.from, query.to);
    }
    async listQuarantine(user) {
        await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth);
        return this.inventory.listQuarantine();
    }
    async diagnoseQuarantine(user, id, dto) {
        return this.inventory.diagnoseQuarantine(id, dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
    async disposeQuarantine(user, id, dto) {
        return this.inventory.disposeQuarantine(id, dto, await (0, staff_principal_1.requireActiveStaff)(user, this.staffAuth));
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Stock write-off / adjustment — always approval-gated (202 { approvalId })',
    }),
    (0, swagger_1.ApiAcceptedResponse)({ description: 'Movement parked for approval; not yet applied.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown product.' }),
    (0, common_1.Post)('movements'),
    (0, common_1.HttpCode)(202),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'movement'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.MovementDto, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "movement", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Receive a batch of IMEI units into stock (stock.received)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Units created in stock; movement + ledger events written.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'One or more IMEI values already exist.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown product or invalid IMEI batch.' }),
    (0, common_1.Post)('receive'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.ReceiveDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "receive", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Receive quantity-tracked stock into a location (stock.received)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Authoritative location balance incremented; movement and ledger event written.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown, serialized, or virtual bundle product.' }),
    (0, common_1.Post)('receive-quantity'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.ReceiveQuantityDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "receiveQuantity", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Receive a serialized third-party-owned consignment unit' }),
    (0, common_1.Post)('consignments/receive'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.ReceiveConsignmentDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "receiveConsignment", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Receive a quantity-tracked third-party-owned consignment lot' }),
    (0, common_1.Post)('consignments/receive-quantity'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_receive'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.ReceiveQuantityConsignmentDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "receiveQuantityConsignment", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List consignment stock and accrued owner liabilities' }),
    (0, common_1.Get)('consignments'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "listConsignments", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List quantity consignment lots and owner liabilities' }),
    (0, common_1.Get)('consignments/quantity'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "listQuantityConsignments", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List consignment payout batches' }),
    (0, common_1.Get)('consignments/payouts'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_payout'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "listConsignmentPayouts", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List owner compensation obligations created by paid-item returns' }),
    (0, common_1.Get)('consignments/adjustments'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_payout'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "listConsignmentAdjustments", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create an owner payout from completed consignment sales' }),
    (0, common_1.Post)('consignments/payouts'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_payout'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.CreateConsignmentPayoutDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "createConsignmentPayout", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Mark a consignment payout paid with an idempotent external payment key' }),
    (0, common_1.Post)('consignments/payouts/:id/pay'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'consignment_payout'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, inventory_dto_1.PayConsignmentPayoutDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "payConsignmentPayout", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Transfer an in_stock unit to another branch (stock.moved)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Unit moved; movement + ledger event written.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Unit not in stock (sold/reserved).' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown unit or same location.' }),
    (0, common_1.Post)('transfer'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'transfer'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.TransferDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "transfer", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Transfer quantity-tracked stock between locations exactly once' }),
    (0, common_1.Post)('transfer-quantity'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'transfer'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.TransferQuantityDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "transferQuantity", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Take inventory for a product at a location (inventory.counted)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Count recorded with counted/expected/diff.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown product.' }),
    (0, common_1.Post)('count'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'count'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.CountDto, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "count", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Reconcile owned inventory valuation layers with GL account 1200' }),
    (0, common_1.Get)('valuation/reconciliation'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "valuationReconciliation", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Historical owned inventory valuation roll-forward for [from,to)' }),
    (0, common_1.Get)('valuation/roll-forward'),
    (0, require_permission_decorator_1.RequirePermission)('finance', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, inventory_dto_1.ValuationRollForwardQueryDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "valuationRollForward", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List serialized units awaiting or completing quarantine disposition' }),
    (0, common_1.Get)('quarantine'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'count'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "listQuarantine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Diagnose a quarantined IMEI after trusted staff photo evidence' }),
    (0, common_1.Post)('quarantine/:id/diagnose'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'count'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, inventory_dto_1.DiagnoseQuarantineDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "diagnoseQuarantine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Apply a four-eyes quarantine disposition to the IMEI' }),
    (0, common_1.Post)('quarantine/:id/dispose'),
    (0, require_permission_decorator_1.RequirePermission)('inventory', 'movement'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, inventory_dto_1.DisposeQuarantineDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "disposeQuarantine", null);
exports.InventoryController = InventoryController = __decorate([
    (0, swagger_1.ApiTags)('inventory'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('inventory'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService,
        staff_auth_service_1.StaffAuthService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map