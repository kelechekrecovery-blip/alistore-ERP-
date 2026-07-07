import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';
import { ValuationService } from './valuation.service';
import { ValuationController } from './valuation.controller';

@Module({
  imports: [ReportsModule],
  providers: [InsightsService, ValuationService],
  controllers: [InsightsController, ValuationController],
})
export class AiModule {}
