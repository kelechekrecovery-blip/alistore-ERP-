import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { OutboxModule } from '../outbox/outbox.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignAttributionService } from './campaign-attribution.service';
import { CampaignTrackingController } from './campaign-tracking.controller';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [StaffAuthModule, AuthzModule, OutboxModule, RateLimitModule],
  controllers: [CampaignsController, CampaignTrackingController],
  providers: [CampaignsService, CampaignAttributionService],
  exports: [CampaignsService, CampaignAttributionService],
})
export class CampaignsModule {}
