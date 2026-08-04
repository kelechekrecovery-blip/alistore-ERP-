import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AuthzModule } from '../authz/authz.module';
import { ReportsModule } from '../reports/reports.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { ValuationService } from './valuation.service';
import { ValuationController } from './valuation.controller';
import { CategorizeController } from './categorize.controller';
import { CategorizeService } from './categorize.service';
import { ModerationModule } from './moderation.module';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ReorderService } from './reorder.service';
import { ReorderController } from './reorder.controller';
import { DescribeService } from './describe.service';
import { DescribeController } from './describe.controller';
import { GradingService } from './grading.service';
import { GradingController } from './grading.controller';
import { PriceScoutService } from './price-scout.service';
import { PriceScoutController } from './price-scout.controller';
import { AiOrchestratorService } from './orchestrator.service';
import { AiOrchestratorController } from './orchestrator.controller';

@Module({
  imports: [SettingsModule, ReportsModule, StaffAuthModule, AuthzModule, ModerationModule],
  providers: [
    InsightsService,
    ValuationService,
    PricingService,
    ReorderService,
    DescribeService,
    GradingService,
    PriceScoutService,
    CategorizeService,
    AiOrchestratorService,
  ],
  controllers: [
    InsightsController,
    ValuationController,
    CategorizeController,
    PricingController,
    ReorderController,
    DescribeController,
    GradingController,
    PriceScoutController,
    AiOrchestratorController,
  ],
})
export class AiModule {}
