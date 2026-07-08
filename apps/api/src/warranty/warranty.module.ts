import { Module } from '@nestjs/common';
import { WarrantyService } from './warranty.service';
import { WarrantyController } from './warranty.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, StaffAuthModule, AuthzModule, OutboxModule],
  providers: [WarrantyService],
  controllers: [WarrantyController],
  exports: [WarrantyService],
})
export class WarrantyModule {}
