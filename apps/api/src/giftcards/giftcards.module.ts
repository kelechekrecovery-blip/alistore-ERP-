import { Module } from '@nestjs/common';
import { GiftcardsController } from './giftcards.controller';
import { GiftcardsService } from './giftcards.service';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, RateLimitModule],
  providers: [GiftcardsService],
  controllers: [GiftcardsController],
  exports: [GiftcardsService],
})
export class GiftcardsModule {}
