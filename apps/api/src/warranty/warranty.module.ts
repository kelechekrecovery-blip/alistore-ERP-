import { Module } from '@nestjs/common';
import { WarrantyService } from './warranty.service';
import { WarrantyController } from './warranty.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [WarrantyService],
  controllers: [WarrantyController],
  exports: [WarrantyService],
})
export class WarrantyModule {}
