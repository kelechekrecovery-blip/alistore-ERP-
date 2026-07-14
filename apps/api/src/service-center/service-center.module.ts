import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { ServiceCenterController } from './service-center.controller';
import { ServiceCenterService } from './service-center.service';
import { ServiceExecutionService } from './service-execution.service';
import { ServiceSlaScheduler } from './service-sla.scheduler';
import { ServiceSlaService } from './service-sla.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [ServiceCenterController],
  providers: [ServiceCenterService, ServiceExecutionService, ServiceSlaService, ServiceSlaScheduler],
  exports: [ServiceCenterService, ServiceExecutionService, ServiceSlaService],
})
export class ServiceCenterModule {}
