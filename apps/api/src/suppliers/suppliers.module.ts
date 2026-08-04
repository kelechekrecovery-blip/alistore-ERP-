import { Module } from '@nestjs/common';
import { SupplierRmaService } from './supplier-rma.service';
import { SuppliersController } from './suppliers.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [SupplierRmaService],
  controllers: [SuppliersController],
  exports: [SupplierRmaService],
})
export class SuppliersModule {}
