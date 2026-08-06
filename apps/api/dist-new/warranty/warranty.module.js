"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WarrantyModule = void 0;
const common_1 = require("@nestjs/common");
const warranty_service_1 = require("./warranty.service");
const warranty_controller_1 = require("./warranty.controller");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const outbox_module_1 = require("../outbox/outbox.module");
const auth_module_1 = require("../auth/auth.module");
let WarrantyModule = class WarrantyModule {
};
exports.WarrantyModule = WarrantyModule;
exports.WarrantyModule = WarrantyModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, outbox_module_1.OutboxModule],
        providers: [warranty_service_1.WarrantyService],
        controllers: [warranty_controller_1.WarrantyController],
        exports: [warranty_service_1.WarrantyService],
    })
], WarrantyModule);
//# sourceMappingURL=warranty.module.js.map