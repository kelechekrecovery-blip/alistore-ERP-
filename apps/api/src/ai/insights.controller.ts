import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InsightsService } from './insights.service';

@ApiTags('ai')
@Controller('ai')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @ApiOperation({ summary: 'Owner AI assistant — insights derived from the Event Ledger' })
  @ApiOkResponse({ description: '{ source, insights[] } — keyless rule engine (LLM when a key is set).' })
  @Get('insights')
  get() {
    return this.insights.insights();
  }
}
