import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { MovementDto } from './inventory.dto';

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
}
