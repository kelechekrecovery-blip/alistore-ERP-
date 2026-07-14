import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { ServiceCenterController } from './service-center.controller';
import { ServiceCenterService } from './service-center.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [ServiceCenterController],
  providers: [ServiceCenterService],
  exports: [ServiceCenterService],
})
export class ServiceCenterModule {}
