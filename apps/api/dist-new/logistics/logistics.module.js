"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogisticsModule = void 0;
const common_1 = require("@nestjs/common");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const logistics_controller_1 = require("./logistics.controller");
const logistics_service_1 = require("./logistics.service");
let LogisticsModule = class LogisticsModule {
};
exports.LogisticsModule = LogisticsModule;
exports.LogisticsModule = LogisticsModule = __decorate([
    (0, common_1.Module)({ imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule], controllers: [logistics_controller_1.LogisticsPublicController, logistics_controller_1.LogisticsController], providers: [logistics_service_1.LogisticsService], exports: [logistics_service_1.LogisticsService] })
], LogisticsModule);
//# sourceMappingURL=logistics.module.js.map