"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectionModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const protection_controller_1 = require("./protection.controller");
const protection_service_1 = require("./protection.service");
let ProtectionModule = class ProtectionModule {
};
exports.ProtectionModule = ProtectionModule;
exports.ProtectionModule = ProtectionModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, rate_limit_module_1.RateLimitModule],
        controllers: [protection_controller_1.ProtectionController],
        providers: [protection_service_1.ProtectionService],
    })
], ProtectionModule);
//# sourceMappingURL=protection.module.js.map