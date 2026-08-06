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
exports.CourierController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const courier_service_1 = require("./courier.service");
const courier_dto_1 = require("./courier.dto");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const permission_guard_1 = require("../authz/permission.guard");
const require_permission_decorator_1 = require("../authz/require-permission.decorator");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const evidence_service_1 = require("../evidence/evidence.service");
let CourierController = class CourierController {
    constructor(courier, evidence) {
        this.courier = courier;
        this.evidence = evidence;
    }
    async getRun(user, id) {
        const run = await this.courier.getRun(id, user.role === 'courier' ? user.customerId : undefined);
        if (!run)
            throw new common_1.NotFoundException(`Курьерский рейс ${id} не найден`);
        return run;
    }
    createRun(user, key, dto) {
        return this.courier.createRun(dto, user.customerId, requireIdempotencyKey(key));
    }
    listMine(user) {
        return this.courier.listMine(user.customerId);
    }
    start(user, id, key) {
        return this.courier.startDelivery(id, user.customerId, requireIdempotencyKey(key));
    }
    async deliver(user, id, key, dto) {
        await this.evidence.assertCourierOrderEvidence(dto.evidenceIdempotencyKey, user.customerId, id, 'Подтверждение доставки');
        return this.courier.completeDelivery(id, dto, user.customerId, requireIdempotencyKey(key));
    }
    removeFromRun(user, id, key, dto) {
        return this.courier.removeOrderFromRun(id, dto, user.customerId, user.role === 'courier' ? user.customerId : undefined, requireIdempotencyKey(key));
    }
    handover(user, key, dto) {
        return this.courier.handover(dto, user.customerId, user.role === 'courier' ? user.customerId : undefined, requireIdempotencyKey(key));
    }
};
exports.CourierController = CourierController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get a courier run' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Courier run id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Run found.' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Run does not exist.' }),
    (0, common_1.Get)('runs/:id'),
    (0, require_permission_decorator_1.RequirePermission)('courier', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CourierController.prototype, "getRun", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Assign a courier run with its COD total (delivery.assigned)' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'Run created.' }),
    (0, common_1.Post)('runs'),
    (0, require_permission_decorator_1.RequirePermission)('courier', 'assign'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, courier_dto_1.CreateRunDto]),
    __metadata("design:returntype", void 0)
], CourierController.prototype, "createRun", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Assigned deliveries for the active courier JWT' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Only deliveries assigned to the current courier.' }),
    (0, common_1.Get)('me/deliveries'),
    (0, require_permission_decorator_1.RequirePermission)('courier', 'read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CourierController.prototype, "listMine", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Start an assigned delivery' }),
    (0, common_1.Post)('orders/:id/start'),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], CourierController.prototype, "start", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Complete delivery and record server-reconciled COD' }),
    (0, common_1.Post)('orders/:id/deliver'),
    (0, require_permission_decorator_1.RequirePermission)('orders', 'transition'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, courier_dto_1.CompleteDeliveryDto]),
    __metadata("design:returntype", Promise)
], CourierController.prototype, "deliver", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Remove an undelivered order from its courier run (delivery.unassigned)' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Order returned to paid; run COD recalculated.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'Order not removable or run already handed over.' }),
    (0, common_1.Post)('orders/:id/remove-from-run'),
    (0, require_permission_decorator_1.RequirePermission)('delivery', 'fail'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, courier_dto_1.RemoveFromRunDto]),
    __metadata("design:returntype", void 0)
], CourierController.prototype, "removeFromRun", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Courier hands over collected COD with reconciliation (cash.handover)',
    }),
    (0, swagger_1.ApiOkResponse)({ description: 'COD reconciled; run marked handed over.' }),
    (0, swagger_1.ApiConflictResponse)({ description: 'COD already handed over.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({
        description: 'Unknown run, or a discrepancy with no reason (invariant #4).',
    }),
    (0, common_1.Post)('handover'),
    (0, require_permission_decorator_1.RequirePermission)('courier', 'handover'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, courier_dto_1.HandoverDto]),
    __metadata("design:returntype", void 0)
], CourierController.prototype, "handover", null);
exports.CourierController = CourierController = __decorate([
    (0, swagger_1.ApiTags)('courier'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('courier'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [courier_service_1.CourierService, evidence_service_1.EvidenceService])
], CourierController);
function requireIdempotencyKey(value) {
    const key = value?.trim();
    if (!key)
        throw new common_1.BadRequestException('Idempotency-Key обязателен');
    if (key.length > 128)
        throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
    return key;
}
//# sourceMappingURL=courier.controller.js.map