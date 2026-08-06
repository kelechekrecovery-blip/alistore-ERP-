"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiftcardsModule = void 0;
const common_1 = require("@nestjs/common");
const giftcards_controller_1 = require("./giftcards.controller");
const giftcards_service_1 = require("./giftcards.service");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
let GiftcardsModule = class GiftcardsModule {
};
exports.GiftcardsModule = GiftcardsModule;
exports.GiftcardsModule = GiftcardsModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, rate_limit_module_1.RateLimitModule],
        providers: [giftcards_service_1.GiftcardsService],
        controllers: [giftcards_controller_1.GiftcardsController],
        exports: [giftcards_service_1.GiftcardsService],
    })
], GiftcardsModule);
//# sourceMappingURL=giftcards.module.js.map