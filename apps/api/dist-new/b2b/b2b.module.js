"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.B2BModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const b2b_controller_1 = require("./b2b.controller");
const b2b_service_1 = require("./b2b.service");
let B2BModule = class B2BModule {
};
exports.B2BModule = B2BModule;
exports.B2BModule = B2BModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, rate_limit_module_1.RateLimitModule],
        controllers: [b2b_controller_1.B2BController],
        providers: [b2b_service_1.B2BService],
    })
], B2BModule);
//# sourceMappingURL=b2b.module.js.map