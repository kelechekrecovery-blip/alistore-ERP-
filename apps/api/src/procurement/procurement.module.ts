import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { ProcurementController, SupplierAdvanceController, SupplierCreditNoteController, SupplierInvoiceController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [ProcurementController, SupplierInvoiceController, SupplierCreditNoteController, SupplierAdvanceController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
