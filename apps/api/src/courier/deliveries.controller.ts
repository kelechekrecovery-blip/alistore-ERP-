import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CourierService } from './courier.service';
import { FailDeliveryDto } from './courier.dto';

const SYSTEM_ACTOR = 'system';

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly courier: CourierService) {}

  @ApiOperation({ summary: 'Record a failed delivery with evidence (delivery.failed)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiOkResponse({ description: 'Failure recorded in the ledger.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order.' })
  @Post(':id/fail')
  fail(@Param('id') id: string, @Body() dto: FailDeliveryDto) {
    return this.courier.failDelivery(id, dto, SYSTEM_ACTOR);
  }
}
