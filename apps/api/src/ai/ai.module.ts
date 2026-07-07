import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { ValuationService } from './valuation.service';
import { ValuationController } from './valuation.controller';
import { CategorizeController } from './categorize.controller';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ReorderService } from './reorder.service';
import { ReorderController } from './reorder.controller';
import { DescribeService } from './describe.service';
import { DescribeController } from './describe.controller';

@Module({
  imports: [ReportsModule],
  providers: [InsightsService, ValuationService, PricingService, ReorderService, DescribeService],
  controllers: [
    InsightsController,
    ValuationController,
    CategorizeController,
    PricingController,
    ReorderController,
    DescribeController,
  ],
})
export class AiModule {}
