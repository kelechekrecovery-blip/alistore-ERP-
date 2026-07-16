import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { LandedCostController, ProcurementController, SupplierAdvanceController, SupplierCreditNoteController, SupplierInvoiceController, SupplierStatementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [ProcurementController, SupplierInvoiceController, SupplierCreditNoteController, SupplierAdvanceController, SupplierStatementController, LandedCostController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
