import { Module } from '@nestjs/common';
import { SupplierPriceImportService } from './supplier-price-import.service';
import { SupplierPriceImportController } from './supplier-price-import.controller';
import { StaffAuthModule } from '../../staff-auth/staff-auth.module';
import { AuthzModule } from '../../authz/authz.module';

/**
 * Slice 4 of docs/SUPPLY-TO-ORDER-PLAN.md — supplier price-list import.
 * Not wired into AppModule yet (out of scope here per task constraints);
 * the one-line addition needed there is `SupplierPriceImportModule` in the
 * `imports` array alongside `ProcurementModule`.
 */
@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [SupplierPriceImportService],
  controllers: [SupplierPriceImportController],
  exports: [SupplierPriceImportService],
})
export class SupplierPriceImportModule {}
