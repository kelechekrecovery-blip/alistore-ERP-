"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraGatewayModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const camera_gateway_controller_1 = require("./camera-gateway.controller");
const camera_gateway_service_1 = require("./camera-gateway.service");
const camera_retention_service_1 = require("./camera-retention.service");
let CameraGatewayModule = class CameraGatewayModule {
};
exports.CameraGatewayModule = CameraGatewayModule;
exports.CameraGatewayModule = CameraGatewayModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_1.AuthModule, staff_auth_module_1.StaffAuthModule, rate_limit_module_1.RateLimitModule], providers: [camera_gateway_service_1.CameraGatewayService, camera_retention_service_1.CameraRetentionService], controllers: [camera_gateway_controller_1.CameraGatewayController], exports: [camera_gateway_service_1.CameraGatewayService, camera_retention_service_1.CameraRetentionService] })
], CameraGatewayModule);
//# sourceMappingURL=camera-gateway.module.js.map