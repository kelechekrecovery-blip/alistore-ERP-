"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorefrontBlocksModule = void 0;
const common_1 = require("@nestjs/common");
const authz_module_1 = require("../authz/authz.module");
const catalog_module_1 = require("../catalog/catalog.module");
const moderation_module_1 = require("../ai/moderation.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const storefront_blocks_controller_1 = require("./storefront-blocks.controller");
const storefront_blocks_service_1 = require("./storefront-blocks.service");
let StorefrontBlocksModule = class StorefrontBlocksModule {
};
exports.StorefrontBlocksModule = StorefrontBlocksModule;
exports.StorefrontBlocksModule = StorefrontBlocksModule = __decorate([
    (0, common_1.Module)({
        imports: [catalog_module_1.CatalogModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, moderation_module_1.ModerationModule],
        controllers: [storefront_blocks_controller_1.StorefrontBlocksPublicController, storefront_blocks_controller_1.StorefrontBlocksAdminController],
        providers: [storefront_blocks_service_1.StorefrontBlocksService],
    })
], StorefrontBlocksModule);
//# sourceMappingURL=storefront-blocks.module.js.map