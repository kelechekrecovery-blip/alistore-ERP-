"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcurementModule = void 0;
const common_1 = require("@nestjs/common");
const authz_module_1 = require("../authz/authz.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const procurement_controller_1 = require("./procurement.controller");
const procurement_service_1 = require("./procurement.service");
const order_line_supply_controller_1 = require("./order-line-supply.controller");
const order_line_supply_service_1 = require("./order-line-supply.service");
const supplier_offers_controller_1 = require("./supplier-offers.controller");
const supplier_offers_service_1 = require("./supplier-offers.service");
const units_module_1 = require("../units/units.module");
const supply_operations_controller_1 = require("./supply-operations.controller");
const supply_operations_service_1 = require("./supply-operations.service");
const supply_quarantine_controller_1 = require("./supply-quarantine.controller");
const supply_quarantine_service_1 = require("./supply-quarantine.service");
let ProcurementModule = class ProcurementModule {
};
exports.ProcurementModule = ProcurementModule;
exports.ProcurementModule = ProcurementModule = __decorate([
    (0, common_1.Module)({
        imports: [staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, units_module_1.UnitsModule],
        controllers: [procurement_controller_1.ProcurementController, procurement_controller_1.SupplierInvoiceController, procurement_controller_1.SupplierCreditNoteController, procurement_controller_1.SupplierAdvanceController, procurement_controller_1.SupplierStatementController, procurement_controller_1.LandedCostController, order_line_supply_controller_1.OrderLineSupplyController, supplier_offers_controller_1.SupplierOffersController, supplier_offers_controller_1.SupplyIntegrityController, supply_operations_controller_1.SupplyOperationsController, supply_quarantine_controller_1.SupplyQuarantineController],
        providers: [procurement_service_1.ProcurementService, order_line_supply_service_1.OrderLineSupplyService, supplier_offers_service_1.SupplierOffersService, supply_operations_service_1.SupplyOperationsService, supply_quarantine_service_1.SupplyQuarantineService],
        exports: [procurement_service_1.ProcurementService, order_line_supply_service_1.OrderLineSupplyService, supplier_offers_service_1.SupplierOffersService, supply_operations_service_1.SupplyOperationsService, supply_quarantine_service_1.SupplyQuarantineService],
    })
], ProcurementModule);
//# sourceMappingURL=procurement.module.js.map