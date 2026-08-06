"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const audit_module_1 = require("./audit/audit.module");
const units_module_1 = require("./units/units.module");
const orders_module_1 = require("./orders/orders.module");
const payments_module_1 = require("./payments/payments.module");
const catalog_module_1 = require("./catalog/catalog.module");
const shifts_module_1 = require("./shifts/shifts.module");
const courier_module_1 = require("./courier/courier.module");
const reservations_module_1 = require("./reservations/reservations.module");
const customers_module_1 = require("./customers/customers.module");
const auth_module_1 = require("./auth/auth.module");
const outbox_module_1 = require("./outbox/outbox.module");
const pos_module_1 = require("./pos/pos.module");
const media_module_1 = require("./media/media.module");
const receipts_module_1 = require("./receipts/receipts.module");
const approvals_module_1 = require("./approvals/approvals.module");
const returns_module_1 = require("./returns/returns.module");
const labels_module_1 = require("./labels/labels.module");
const products_module_1 = require("./products/products.module");
const inventory_module_1 = require("./inventory/inventory.module");
const analytics_module_1 = require("./analytics/analytics.module");
const reports_module_1 = require("./reports/reports.module");
const exchanges_module_1 = require("./exchanges/exchanges.module");
const warranty_module_1 = require("./warranty/warranty.module");
const suppliers_module_1 = require("./suppliers/suppliers.module");
const import_module_1 = require("./import/import.module");
const debts_module_1 = require("./debts/debts.module");
const owner_alerts_module_1 = require("./owner-alerts/owner-alerts.module");
const support_module_1 = require("./support/support.module");
const health_module_1 = require("./health/health.module");
const documents_module_1 = require("./documents/documents.module");
const observability_module_1 = require("./observability/observability.module");
const authz_module_1 = require("./authz/authz.module");
const realtime_module_1 = require("./realtime/realtime.module");
const localization_module_1 = require("./localization/localization.module");
const staff_auth_module_1 = require("./staff-auth/staff-auth.module");
const tradeins_module_1 = require("./tradeins/tradeins.module");
const ai_module_1 = require("./ai/ai.module");
const telegram_agent_module_1 = require("./telegram-agent/telegram-agent.module");
const evidence_module_1 = require("./evidence/evidence.module");
const campaigns_module_1 = require("./campaigns/campaigns.module");
const giftcards_module_1 = require("./giftcards/giftcards.module");
const notifications_module_1 = require("./notifications/notifications.module");
const b2b_module_1 = require("./b2b/b2b.module");
const protection_module_1 = require("./protection/protection.module");
const procurement_module_1 = require("./procurement/procurement.module");
const finance_module_1 = require("./finance/finance.module");
const staff_tasks_module_1 = require("./staff-tasks/staff-tasks.module");
const business_module_1 = require("./business/business.module");
const settings_module_1 = require("./settings/settings.module");
const hr_module_1 = require("./hr/hr.module");
const logistics_module_1 = require("./logistics/logistics.module");
const service_center_module_1 = require("./service-center/service-center.module");
const storefront_module_1 = require("./storefront/storefront.module");
const promotions_module_1 = require("./promotions/promotions.module");
const storefront_blocks_module_1 = require("./storefront-blocks/storefront-blocks.module");
const refunds_module_1 = require("./refunds/refunds.module");
const store_operations_module_1 = require("./store-operations/store-operations.module");
const camera_gateway_module_1 = require("./camera-gateway/camera-gateway.module");
const runtime_env_files_1 = require("./config/runtime-env-files");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: (0, runtime_env_files_1.resolveRuntimeEnvFiles)(process.env.NODE_ENV),
            }),
            prisma_module_1.PrismaModule,
            audit_module_1.AuditModule,
            analytics_module_1.AnalyticsModule,
            units_module_1.UnitsModule,
            orders_module_1.OrdersModule,
            payments_module_1.PaymentsModule,
            catalog_module_1.CatalogModule,
            shifts_module_1.ShiftsModule,
            courier_module_1.CourierModule,
            reservations_module_1.ReservationsModule,
            customers_module_1.CustomersModule,
            auth_module_1.AuthModule,
            outbox_module_1.OutboxModule,
            pos_module_1.PosModule,
            media_module_1.MediaModule,
            receipts_module_1.ReceiptsModule,
            approvals_module_1.ApprovalsModule,
            returns_module_1.ReturnsModule,
            labels_module_1.LabelsModule,
            products_module_1.ProductsModule,
            inventory_module_1.InventoryModule,
            reports_module_1.ReportsModule,
            exchanges_module_1.ExchangesModule,
            warranty_module_1.WarrantyModule,
            suppliers_module_1.SuppliersModule,
            import_module_1.ImportModule,
            debts_module_1.DebtsModule,
            owner_alerts_module_1.OwnerAlertsModule,
            support_module_1.SupportModule,
            health_module_1.HealthModule,
            documents_module_1.DocumentsModule,
            observability_module_1.ObservabilityModule,
            authz_module_1.AuthzModule,
            realtime_module_1.RealtimeModule,
            localization_module_1.LocalizationModule,
            staff_auth_module_1.StaffAuthModule,
            tradeins_module_1.TradeInsModule,
            evidence_module_1.EvidenceModule,
            ai_module_1.AiModule,
            telegram_agent_module_1.TelegramAgentModule,
            campaigns_module_1.CampaignsModule,
            giftcards_module_1.GiftcardsModule,
            notifications_module_1.NotificationsModule,
            b2b_module_1.B2BModule,
            protection_module_1.ProtectionModule,
            procurement_module_1.ProcurementModule,
            finance_module_1.FinanceModule,
            staff_tasks_module_1.StaffTasksModule,
            settings_module_1.SettingsModule,
            business_module_1.BusinessModule,
            hr_module_1.HrModule,
            logistics_module_1.LogisticsModule,
            service_center_module_1.ServiceCenterModule,
            storefront_module_1.StorefrontModule,
            promotions_module_1.PromotionsModule,
            storefront_blocks_module_1.StorefrontBlocksModule,
            refunds_module_1.RefundsModule,
            store_operations_module_1.StoreOperationsModule,
            camera_gateway_module_1.CameraGatewayModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map