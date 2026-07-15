import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { PromotionsAdminController, PromotionsPublicController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [StaffAuthModule, AuthzModule],
  controllers: [PromotionsPublicController, PromotionsAdminController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
