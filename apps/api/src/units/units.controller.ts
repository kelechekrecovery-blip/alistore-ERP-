import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@ApiTags('units')
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @ApiOperation({ summary: 'Look up a device unit by IMEI (status, order, product) — exchange lookup' })
  @ApiParam({ name: 'imei', description: 'IMEI / serial of the unit' })
  @ApiOkResponse({ description: 'Unit with its product.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown IMEI.' })
  @Get(':imei')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('units', 'read')
  get(@Param('imei') imei: string) {
    return this.units.getByImei(imei);
  }
}
