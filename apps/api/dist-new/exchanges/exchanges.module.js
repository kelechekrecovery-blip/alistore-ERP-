"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangesModule = void 0;
const common_1 = require("@nestjs/common");
const exchanges_service_1 = require("./exchanges.service");
const exchanges_controller_1 = require("./exchanges.controller");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const units_module_1 = require("../units/units.module");
const outbox_module_1 = require("../outbox/outbox.module");
let ExchangesModule = class ExchangesModule {
};
exports.ExchangesModule = ExchangesModule;
exports.ExchangesModule = ExchangesModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, units_module_1.UnitsModule, outbox_module_1.OutboxModule],
        providers: [exchanges_service_1.ExchangesService],
        controllers: [exchanges_controller_1.ExchangesController],
        exports: [exchanges_service_1.ExchangesService],
    })
], ExchangesModule);
//# sourceMappingURL=exchanges.module.js.map