import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { MovementDto, TransferDto } from './inventory.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @ApiOperation({
    summary: 'Stock write-off / adjustment — always approval-gated (202 { approvalId })',
  })
  @ApiAcceptedResponse({ description: 'Movement parked for approval; not yet applied.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown product.' })
  @Post('movements')
  @HttpCode(202)
  movement(@Body() dto: MovementDto) {
    return this.inventory.movement(dto, dto.requester ?? SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'Transfer an in_stock unit to another branch (stock.moved)' })
  @ApiCreatedResponse({ description: 'Unit moved; movement + ledger event written.' })
  @ApiConflictResponse({ description: 'Unit not in stock (sold/reserved).' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown unit or same location.' })
  @Post('transfer')
  transfer(@Body() dto: TransferDto) {
    return this.inventory.transfer(dto, dto.requester ?? SYSTEM_ACTOR);
  }
}
