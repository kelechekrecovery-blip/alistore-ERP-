"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosModule = void 0;
const common_1 = require("@nestjs/common");
const settings_module_1 = require("../settings/settings.module");
const pos_service_1 = require("./pos.service");
const pos_controller_1 = require("./pos.controller");
const customers_module_1 = require("../customers/customers.module");
const shifts_module_1 = require("../shifts/shifts.module");
const units_module_1 = require("../units/units.module");
const orders_module_1 = require("../orders/orders.module");
const payments_module_1 = require("../payments/payments.module");
const approvals_module_1 = require("../approvals/approvals.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
let PosModule = class PosModule {
};
exports.PosModule = PosModule;
exports.PosModule = PosModule = __decorate([
    (0, common_1.Module)({
        imports: [settings_module_1.SettingsModule,
            customers_module_1.CustomersModule,
            shifts_module_1.ShiftsModule,
            units_module_1.UnitsModule,
            orders_module_1.OrdersModule,
            payments_module_1.PaymentsModule,
            approvals_module_1.ApprovalsModule,
            staff_auth_module_1.StaffAuthModule,
            authz_module_1.AuthzModule,
        ],
        providers: [pos_service_1.PosService],
        controllers: [pos_controller_1.PosController],
    })
], PosModule);
//# sourceMappingURL=pos.module.js.map