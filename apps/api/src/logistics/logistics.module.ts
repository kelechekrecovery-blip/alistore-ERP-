import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { LogisticsController, LogisticsPublicController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

@Module({ imports: [StaffAuthModule, AuthzModule], controllers: [LogisticsPublicController, LogisticsController], providers: [LogisticsService], exports: [LogisticsService] })
export class LogisticsModule {}
