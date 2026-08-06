"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeInsModule = void 0;
const common_1 = require("@nestjs/common");
const tradeins_controller_1 = require("./tradeins.controller");
const tradeins_service_1 = require("./tradeins.service");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const outbox_module_1 = require("../outbox/outbox.module");
const settings_module_1 = require("../settings/settings.module");
let TradeInsModule = class TradeInsModule {
};
exports.TradeInsModule = TradeInsModule;
exports.TradeInsModule = TradeInsModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, outbox_module_1.OutboxModule, settings_module_1.SettingsModule],
        controllers: [tradeins_controller_1.TradeInsController],
        providers: [tradeins_service_1.TradeInsService],
        exports: [tradeins_service_1.TradeInsService],
    })
], TradeInsModule);
//# sourceMappingURL=tradeins.module.js.map