"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptsModule = void 0;
const common_1 = require("@nestjs/common");
const receipts_service_1 = require("./receipts.service");
const receipts_controller_1 = require("./receipts.controller");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
let ReceiptsModule = class ReceiptsModule {
};
exports.ReceiptsModule = ReceiptsModule;
exports.ReceiptsModule = ReceiptsModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule],
        providers: [receipts_service_1.ReceiptsService],
        controllers: [receipts_controller_1.ReceiptsController],
        exports: [receipts_service_1.ReceiptsService],
    })
], ReceiptsModule);
//# sourceMappingURL=receipts.module.js.map