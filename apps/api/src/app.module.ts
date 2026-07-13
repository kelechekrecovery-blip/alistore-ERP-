import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { UnitsModule } from './units/units.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { CatalogModule } from './catalog/catalog.module';
import { ShiftsModule } from './shifts/shifts.module';
import { CourierModule } from './courier/courier.module';
import { ReservationsModule } from './reservations/reservations.module';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { OutboxModule } from './outbox/outbox.module';
import { PosModule } from './pos/pos.module';
import { MediaModule } from './media/media.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { ReturnsModule } from './returns/returns.module';
import { LabelsModule } from './labels/labels.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ReportsModule } from './reports/reports.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { WarrantyModule } from './warranty/warranty.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ImportModule } from './import/import.module';
import { DebtsModule } from './debts/debts.module';
import { SupportModule } from './support/support.module';
import { HealthModule } from './health/health.module';
import { DocumentsModule } from './documents/documents.module';
import { ObservabilityModule } from './observability/observability.module';
import { AuthzModule } from './authz/authz.module';
import { RealtimeModule } from './realtime/realtime.module';
import { LocalizationModule } from './localization/localization.module';
import { StaffAuthModule } from './staff-auth/staff-auth.module';
import { TradeInsModule } from './tradeins/tradeins.module';
import { AiModule } from './ai/ai.module';
import { EvidenceModule } from './evidence/evidence.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { GiftcardsModule } from './giftcards/giftcards.module';
import { NotificationsModule } from './notifications/notifications.module';
import { B2BModule } from './b2b/b2b.module';
import { ProtectionModule } from './protection/protection.module';
import { ProcurementModule } from './procurement/procurement.module';
import { FinanceModule } from './finance/finance.module';
import { StaffTasksModule } from './staff-tasks/staff-tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    UnitsModule,
    OrdersModule,
    PaymentsModule,
    CatalogModule,
    ShiftsModule,
    CourierModule,
    ReservationsModule,
    CustomersModule,
    AuthModule,
    OutboxModule,
    PosModule,
    MediaModule,
    ReceiptsModule,
    ApprovalsModule,
    ReturnsModule,
    LabelsModule,
    ProductsModule,
    InventoryModule,
    ReportsModule,
    ExchangesModule,
    WarrantyModule,
    SuppliersModule,
    ImportModule,
    DebtsModule,
    SupportModule,
    HealthModule,
    DocumentsModule,
    ObservabilityModule,
    AuthzModule,
    RealtimeModule,
    LocalizationModule,
    StaffAuthModule,
    TradeInsModule,
    EvidenceModule,
    AiModule,
    CampaignsModule,
    GiftcardsModule,
    NotificationsModule,
    B2BModule,
    ProtectionModule,
    ProcurementModule,
    FinanceModule,
    StaffTasksModule,
  ],
})
export class AppModule {}
