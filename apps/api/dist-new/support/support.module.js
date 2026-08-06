"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportModule = void 0;
const common_1 = require("@nestjs/common");
const support_service_1 = require("./support.service");
const support_controller_1 = require("./support.controller");
const auth_module_1 = require("../auth/auth.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const outbox_module_1 = require("../outbox/outbox.module");
let SupportModule = class SupportModule {
};
exports.SupportModule = SupportModule;
exports.SupportModule = SupportModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, rate_limit_module_1.RateLimitModule, outbox_module_1.OutboxModule],
        providers: [support_service_1.SupportService],
        controllers: [support_controller_1.SupportController],
        exports: [support_service_1.SupportService],
    })
], SupportModule);
//# sourceMappingURL=support.module.js.map