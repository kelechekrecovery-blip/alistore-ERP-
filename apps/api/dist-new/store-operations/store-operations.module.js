"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreOperationsModule = void 0;
const common_1 = require("@nestjs/common");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const store_operations_controller_1 = require("./store-operations.controller");
const store_operations_service_1 = require("./store-operations.service");
let StoreOperationsModule = class StoreOperationsModule {
};
exports.StoreOperationsModule = StoreOperationsModule;
exports.StoreOperationsModule = StoreOperationsModule = __decorate([
    (0, common_1.Module)({ imports: [authz_module_1.AuthzModule, staff_auth_module_1.StaffAuthModule], controllers: [store_operations_controller_1.StoreOperationsController], providers: [store_operations_service_1.StoreOperationsService] })
], StoreOperationsModule);
//# sourceMappingURL=store-operations.module.js.map