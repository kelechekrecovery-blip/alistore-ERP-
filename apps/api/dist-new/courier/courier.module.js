"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourierModule = void 0;
const common_1 = require("@nestjs/common");
const courier_service_1 = require("./courier.service");
const courier_controller_1 = require("./courier.controller");
const deliveries_controller_1 = require("./deliveries.controller");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const outbox_module_1 = require("../outbox/outbox.module");
const units_module_1 = require("../units/units.module");
const evidence_module_1 = require("../evidence/evidence.module");
let CourierModule = class CourierModule {
};
exports.CourierModule = CourierModule;
exports.CourierModule = CourierModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, outbox_module_1.OutboxModule, units_module_1.UnitsModule, evidence_module_1.EvidenceModule],
        providers: [courier_service_1.CourierService],
        controllers: [courier_controller_1.CourierController, deliveries_controller_1.DeliveriesController],
        exports: [courier_service_1.CourierService],
    })
], CourierModule);
//# sourceMappingURL=courier.module.js.map