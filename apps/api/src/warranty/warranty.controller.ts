import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { WarrantyService } from './warranty.service';
import { OpenWarrantyDto, WarrantyStatusDto } from './warranty.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

const SYSTEM_ACTOR = 'system';

@ApiTags('warranty')
@Controller('warranty')
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  @ApiOperation({ summary: 'List warranty cases by customer / imei / status' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'imei', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ description: 'Cases ordered by SLA (soonest first).' })
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('warranty', 'read')
  list(
    @Query('customerId') customerId?: string,
    @Query('imei') imei?: string,
    @Query('status') status?: string,
  ) {
    return this.warranty.list({ customerId, imei, status });
  }

  @ApiOperation({ summary: 'Get a warranty case' })
  @ApiNotFoundResponse({ description: 'Case does not exist.' })
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('warranty', 'read')
  async getOne(@Param('id') id: string) {
    const wc = await this.warranty.get(id);
    if (!wc) throw new NotFoundException(`Гарантия ${id} не найдена`);
    return wc;
  }

  @ApiOperation({ summary: 'Open a warranty case (warranty.created, SLA set)' })
  @ApiCreatedResponse({ description: 'Case opened.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown device.' })
  @Post()
  open(@Body() dto: OpenWarrantyDto) {
    return this.warranty.open(dto, SYSTEM_ACTOR);
  }

  @ApiOperation({ summary: 'Advance a warranty case through its status machine' })
  @ApiOkResponse({ description: 'Status updated.' })
  @ApiUnprocessableEntityResponse({ description: 'Illegal transition.' })
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('warranty', 'transition')
  transition(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: WarrantyStatusDto) {
    return this.warranty.transition(id, dto.status, user.customerId);
  }
}
