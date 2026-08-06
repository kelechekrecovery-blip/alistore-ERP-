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
exports.CameraGatewayController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const camera_gateway_dto_1 = require("./camera-gateway.dto");
const camera_gateway_service_1 = require("./camera-gateway.service");
let CameraGatewayController = class CameraGatewayController {
    constructor(gateway) {
        this.gateway = gateway;
    }
    register(dto, user) {
        if (user.role !== 'owner' && user.role !== 'admin')
            throw new common_1.ForbiddenException('Только owner/admin могут регистрировать edge-устройства');
        return this.gateway.register(dto, user.customerId);
    }
    ingest(dto, secret, timestamp, signature) {
        return this.gateway.ingest(dto, secret ?? '', timestamp ?? '', signature ?? '');
    }
};
exports.CameraGatewayController = CameraGatewayController;
__decorate([
    (0, common_1.Post)('devices'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, active_staff_guard_1.ActiveStaffGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [camera_gateway_dto_1.RegisterEdgeDeviceDto, Object]),
    __metadata("design:returntype", void 0)
], CameraGatewayController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('events'),
    (0, common_1.UseGuards)(throttler_1.ThrottlerGuard),
    (0, throttler_1.Throttle)({ default: { limit: 120, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-edge-device-secret')),
    __param(2, (0, common_1.Headers)('x-edge-device-timestamp')),
    __param(3, (0, common_1.Headers)('x-edge-device-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [camera_gateway_dto_1.IngestCameraEventDto, String, String, String]),
    __metadata("design:returntype", void 0)
], CameraGatewayController.prototype, "ingest", null);
exports.CameraGatewayController = CameraGatewayController = __decorate([
    (0, swagger_1.ApiTags)('camera-gateway'),
    (0, common_1.Controller)('camera-gateway'),
    __metadata("design:paramtypes", [camera_gateway_service_1.CameraGatewayService])
], CameraGatewayController);
//# sourceMappingURL=camera-gateway.controller.js.map