"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersModule = void 0;
const common_1 = require("@nestjs/common");
const settings_module_1 = require("../settings/settings.module");
const orders_service_1 = require("./orders.service");
const orders_controller_1 = require("./orders.controller");
const units_module_1 = require("../units/units.module");
const staff_auth_module_1 = require("../staff-auth/staff-auth.module");
const authz_module_1 = require("../authz/authz.module");
const rate_limit_module_1 = require("../rate-limit/rate-limit.module");
const outbox_module_1 = require("../outbox/outbox.module");
const logistics_module_1 = require("../logistics/logistics.module");
const receipts_module_1 = require("../receipts/receipts.module");
const promotions_module_1 = require("../promotions/promotions.module");
const campaigns_module_1 = require("../campaigns/campaigns.module");
const observability_module_1 = require("../observability/observability.module");
const order_no_show_scheduler_1 = require("./order-no-show.scheduler");
const order_cancellations_service_1 = require("./order-cancellations.service");
const order_cancellation_resolution_service_1 = require("./order-cancellation-resolution.service");
const order_item_handover_service_1 = require("./order-item-handover.service");
const order_item_reservation_service_1 = require("./order-item-reservation.service");
let OrdersModule = class OrdersModule {
};
exports.OrdersModule = OrdersModule;
exports.OrdersModule = OrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [settings_module_1.SettingsModule, units_module_1.UnitsModule, staff_auth_module_1.StaffAuthModule, authz_module_1.AuthzModule, rate_limit_module_1.RateLimitModule, outbox_module_1.OutboxModule, logistics_module_1.LogisticsModule, receipts_module_1.ReceiptsModule, promotions_module_1.PromotionsModule, campaigns_module_1.CampaignsModule, observability_module_1.ObservabilityModule],
        providers: [
            orders_service_1.OrdersService,
            order_cancellations_service_1.OrderCancellationsService,
            order_cancellation_resolution_service_1.OrderCancellationResolutionService,
            order_item_handover_service_1.OrderItemHandoverService,
            order_item_reservation_service_1.OrderItemReservationService,
            order_no_show_scheduler_1.OrderNoShowScheduler,
        ],
        controllers: [orders_controller_1.OrdersController],
        exports: [orders_service_1.OrdersService, order_cancellations_service_1.OrderCancellationsService, order_cancellation_resolution_service_1.OrderCancellationResolutionService, order_item_handover_service_1.OrderItemHandoverService, order_item_reservation_service_1.OrderItemReservationService],
    })
], OrdersModule);
//# sourceMappingURL=orders.module.js.map