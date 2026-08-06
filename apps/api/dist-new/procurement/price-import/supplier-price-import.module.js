"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupplierPriceImportModule = void 0;
const common_1 = require("@nestjs/common");
const supplier_price_import_service_1 = require("./supplier-price-import.service");
const supplier_price_import_controller_1 = require("./supplier-price-import.controller");
const staff_auth_module_1 = require("../../staff-auth/staff-auth.module");
const authz_module_1 = require("../../authz/authz.module");
let SupplierPriceImportModule = class SupplierPriceImportModule {
};
exports.SupplierPriceImportModule = SupplierPriceImportModule;
exports.SupplierPriceImportModule = SupplierPriceImportModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule],
        providers: [supplier_price_import_service_1.SupplierPriceImportService],
        controllers: [supplier_price_import_controller_1.SupplierPriceImportController],
        exports: [supplier_price_import_service_1.SupplierPriceImportService],
    })
], SupplierPriceImportModule);
//# sourceMappingURL=supplier-price-import.module.js.map