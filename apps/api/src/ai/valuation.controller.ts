import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { ValuationService } from './valuation.service';
import { AssessDto } from './valuation.dto';

@ApiTags('ai')
@Controller('ai')
export class ValuationController {
  constructor(private readonly valuation: ValuationService) {}

  @ApiOperation({ summary: 'Оценка Б/У устройства — resale + buyback по правилам депрециации' })
  @ApiOkResponse({ description: '{ resale, buyback, retainedPct, factors, notes }.' })
  @ApiUnprocessableEntityResponse({ description: 'Нет basePrice/sku или неизвестный SKU.' })
  @Post('assess')
  assess(@Body() dto: AssessDto) {
    return this.valuation.assess(dto);
  }
}
