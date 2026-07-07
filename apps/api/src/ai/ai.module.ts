import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';

@Module({
  imports: [ReportsModule],
  providers: [InsightsService],
  controllers: [InsightsController],
})
export class AiModule {}
