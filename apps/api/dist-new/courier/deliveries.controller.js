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
exports.DeliveriesController = void 0;
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
let DeliveriesController = class DeliveriesController {
    constructor(courier, evidence) {
        this.courier = courier;
        this.evidence = evidence;
    }
    async fail(user, id, idempotencyKey, dto) {
        const key = idempotencyKey?.trim();
        if (!key)
            throw new common_1.BadRequestException('Idempotency-Key обязателен');
        if (key.length > 128)
            throw new common_1.BadRequestException('Idempotency-Key слишком длинный');
        await this.courier.assertAssignedCourier(id, user.customerId);
        await this.evidence.assertCourierOrderEvidence(dto.evidenceIdempotencyKey, user.customerId, id, 'Неуспешная доставка');
        return this.courier.failDelivery(id, dto, user.customerId, key);
    }
};
exports.DeliveriesController = DeliveriesController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Record a failed delivery with evidence (delivery.failed)' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Order id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Failure recorded in the ledger.' }),
    (0, swagger_1.ApiUnprocessableEntityResponse)({ description: 'Unknown order.' }),
    (0, common_1.Post)(':id/fail'),
    (0, require_permission_decorator_1.RequirePermission)('delivery', 'fail'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, courier_dto_1.FailDeliveryDto]),
    __metadata("design:returntype", Promise)
], DeliveriesController.prototype, "fail", null);
exports.DeliveriesController = DeliveriesController = __decorate([
    (0, swagger_1.ApiTags)('deliveries'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('deliveries'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard, permission_guard_1.PermissionGuard),
    __metadata("design:paramtypes", [courier_service_1.CourierService, evidence_service_1.EvidenceService])
], DeliveriesController);
//# sourceMappingURL=deliveries.controller.js.map