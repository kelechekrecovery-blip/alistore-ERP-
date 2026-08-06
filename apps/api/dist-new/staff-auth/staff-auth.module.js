"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffAuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const staff_auth_service_1 = require("./staff-auth.service");
const staff_auth_controller_1 = require("./staff-auth.controller");
const jwt_secret_1 = require("../auth/jwt-secret");
const authz_module_1 = require("../authz/authz.module");
const auth_module_1 = require("../auth/auth.module");
const audit_module_1 = require("../audit/audit.module");
const active_staff_guard_1 = require("../auth/active-staff.guard");
const blind_cash_read_guard_1 = require("../auth/blind-cash-read.guard");
let StaffAuthModule = class StaffAuthModule {
};
exports.StaffAuthModule = StaffAuthModule;
exports.StaffAuthModule = StaffAuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            authz_module_1.AuthzModule,
            auth_module_1.AuthModule,
            audit_module_1.AuditModule,
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: (0, jwt_secret_1.resolveJwtSecret)(config),
                }),
            }),
        ],
        providers: [staff_auth_service_1.StaffAuthService, active_staff_guard_1.ActiveStaffGuard, blind_cash_read_guard_1.BlindCashReadGuard],
        controllers: [staff_auth_controller_1.StaffAuthController],
        exports: [staff_auth_service_1.StaffAuthService, active_staff_guard_1.ActiveStaffGuard, blind_cash_read_guard_1.BlindCashReadGuard],
    })
], StaffAuthModule);
//# sourceMappingURL=staff-auth.module.js.map