import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { UnitsService } from './units.service';

@ApiTags('units')
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @ApiOperation({ summary: 'Look up a device unit by IMEI (status, order, product) — exchange lookup' })
  @ApiParam({ name: 'imei', description: 'IMEI / serial of the unit' })
  @ApiOkResponse({ description: 'Unit with its product.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown IMEI.' })
  @Get(':imei')
  get(@Param('imei') imei: string) {
    return this.units.getByImei(imei);
  }
}
