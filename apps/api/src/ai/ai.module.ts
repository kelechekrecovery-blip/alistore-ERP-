import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { ValuationService } from './valuation.service';
import { ValuationController } from './valuation.controller';
import { CategorizeController } from './categorize.controller';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [ReportsModule],
  providers: [InsightsService, ValuationService, PricingService],
  controllers: [InsightsController, ValuationController, CategorizeController, PricingController],
})
export class AiModule {}
