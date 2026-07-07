import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CreateTradeInDto, TradeInViewDto } from './tradeins.dto';
import { TradeInsService } from './tradeins.service';

@ApiTags('tradeins')
@Controller('tradeins')
export class TradeInsController {
  constructor(private readonly tradeIns: TradeInsService) {}

  @ApiOperation({
    summary: 'Assess and contract a used-device buyback (trade-in)',
    description:
      'Creates TradeInDevice, assigns contractId, masks seller passport in the response, and writes tradein.assessed/tradein.contracted events.',
  })
  @ApiCreatedResponse({ type: TradeInViewDto })
  @ApiUnprocessableEntityResponse({ description: 'Customer does not exist or payload is invalid.' })
  @Post()
  create(@Body() dto: CreateTradeInDto) {
    return this.tradeIns.create(dto);
  }

  @ApiOperation({ summary: 'Get a trade-in by id with protected fields masked' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: TradeInViewDto })
  @ApiNotFoundResponse({ description: 'Trade-in does not exist.' })
  @Get(':id')
  async get(@Param('id') id: string) {
    const tradeIn = await this.tradeIns.get(id);
    if (!tradeIn) throw new NotFoundException(`Скупка ${id} не найдена`);
    return tradeIn;
  }
}
