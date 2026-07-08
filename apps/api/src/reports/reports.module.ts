import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
