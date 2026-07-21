import { Module } from '@nestjs/common';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { PromotionsAdminController, PromotionsPublicController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [StaffAuthModule, AuthzModule, RateLimitModule],
  controllers: [PromotionsPublicController, PromotionsAdminController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
