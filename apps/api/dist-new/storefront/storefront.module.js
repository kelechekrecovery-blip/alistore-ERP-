"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorefrontModule = void 0;
const common_1 = require("@nestjs/common");
const approvals_module_1 = require("../approvals/approvals.module");
const catalog_module_1 = require("../catalog/catalog.module");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const moderation_module_1 = require("../ai/moderation.module");
const storefront_controller_1 = require("./storefront.controller");
const storefront_service_1 = require("./storefront.service");
let StorefrontModule = class StorefrontModule {
};
exports.StorefrontModule = StorefrontModule;
exports.StorefrontModule = StorefrontModule = __decorate([
    (0, common_1.Module)({
        imports: [catalog_module_1.CatalogModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, moderation_module_1.ModerationModule, approvals_module_1.ApprovalsModule],
        controllers: [storefront_controller_1.StorefrontPublicController, storefront_controller_1.StorefrontAdminController],
        providers: [storefront_service_1.StorefrontService],
    })
], StorefrontModule);
//# sourceMappingURL=storefront.module.js.map