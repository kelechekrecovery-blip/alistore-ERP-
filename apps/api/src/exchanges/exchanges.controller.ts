import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ExchangesService } from './exchanges.service';
import { ExchangeDto } from './exchanges.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('exchanges')
@Controller('exchanges')
export class ExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  @ApiOperation({
    summary: 'Exchange a device: return old + sell new + collect surcharge (atomic)',
  })
  @ApiCreatedResponse({ description: 'Exchange completed; new paid order + ledger trail.' })
  @ApiConflictResponse({ description: 'Old unit not sold, or no stock for the new device.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order/item/product, or cheaper exchange.' })
  @Post()
  exchange(@Body() dto: ExchangeDto) {
    return this.exchanges.exchange(dto, dto.requester ?? SYSTEM_ACTOR);
  }
}
