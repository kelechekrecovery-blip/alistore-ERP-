import { Module } from '@nestjs/common';
import { AuthzModule } from '../authz/authz.module';
import { OutboxModule } from '../outbox/outbox.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignAttributionService } from './campaign-attribution.service';

@Module({
  imports: [StaffAuthModule, AuthzModule, OutboxModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignAttributionService],
  exports: [CampaignsService, CampaignAttributionService],
})
export class CampaignsModule {}
