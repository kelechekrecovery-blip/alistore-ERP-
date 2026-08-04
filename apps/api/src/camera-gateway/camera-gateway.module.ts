import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { CameraGatewayController } from './camera-gateway.controller';
import { CameraGatewayService } from './camera-gateway.service';
import { CameraRetentionService } from './camera-retention.service';

@Module({ imports: [AuthModule, StaffAuthModule, RateLimitModule], providers: [CameraGatewayService, CameraRetentionService], controllers: [CameraGatewayController], exports: [CameraGatewayService, CameraRetentionService] })
export class CameraGatewayModule {}
