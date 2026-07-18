import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { ServiceCenterController } from './service-center.controller';
import { ServiceCenterService } from './service-center.service';
import { ServiceExecutionService } from './service-execution.service';
import { ServiceSlaScheduler } from './service-sla.scheduler';
import { ServiceSlaService } from './service-sla.service';
import { ServiceLoanerService } from './service-loaner.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, OutboxModule],
  controllers: [ServiceCenterController],
  providers: [ServiceCenterService, ServiceExecutionService, ServiceLoanerService, ServiceSlaService, ServiceSlaScheduler],
  exports: [ServiceCenterService, ServiceExecutionService, ServiceLoanerService, ServiceSlaService],
})
export class ServiceCenterModule {}
