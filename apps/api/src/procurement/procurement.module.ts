import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { LandedCostController, ProcurementController, SupplierAdvanceController, SupplierCreditNoteController, SupplierInvoiceController, SupplierStatementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { OrderLineSupplyController } from './order-line-supply.controller';
import { OrderLineSupplyService } from './order-line-supply.service';
import { SupplierOffersController, SupplyIntegrityController } from './supplier-offers.controller';
import { SupplierOffersService } from './supplier-offers.service';
import { UnitsModule } from '../units/units.module';
import { SupplyOperationsController } from './supply-operations.controller';
import { SupplyOperationsService } from './supply-operations.service';
import { SupplyQuarantineController } from './supply-quarantine.controller';
import { SupplyQuarantineService } from './supply-quarantine.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, UnitsModule, FeatureFlagsModule],
  controllers: [ProcurementController, SupplierInvoiceController, SupplierCreditNoteController, SupplierAdvanceController, SupplierStatementController, LandedCostController, OrderLineSupplyController, SupplierOffersController, SupplyIntegrityController, SupplyOperationsController, SupplyQuarantineController],
  providers: [ProcurementService, OrderLineSupplyService, SupplierOffersService, SupplyOperationsService, SupplyQuarantineService],
  exports: [ProcurementService, OrderLineSupplyService, SupplierOffersService, SupplyOperationsService, SupplyQuarantineService],
})
export class ProcurementModule {}
