import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { CloseShiftDto, HandoverShiftDto, OpenShiftDto } from './shifts.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @ApiOperation({ summary: "Staff member's currently open shift (or null)" })
  @ApiOkResponse({ description: 'Open shift or null.' })
  @Get('current')
  @RequirePermission('shift', 'read')
  async current(@CurrentUser() user: AuthPrincipal, @Query('staffId') _staffId?: string) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.shifts.currentOpen(staffId);
  }

  @Get('open')
  @RequirePermission('shift', 'handover')
  async openShifts(@CurrentUser() user: AuthPrincipal, @Query('point') point?: string) {
    await requireActiveStaff(user, this.staffAuth);
    return this.shifts.openShifts(point);
  }

  @ApiOperation({ summary: 'Get a cash shift with its payments' })
  @ApiParam({ name: 'id', description: 'Cash shift id' })
  @ApiOkResponse({ description: 'Shift found.' })
  @ApiNotFoundResponse({ description: 'Shift does not exist.' })
  @Get(':id')
  @RequirePermission('shift', 'read')
  async get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    await requireActiveStaff(user, this.staffAuth);
    const shift = await this.shifts.get(id);
    if (!shift) throw new NotFoundException(`Смена ${id} не найдена`);
    return shift;
  }

  @ApiOperation({ summary: 'Open a cash shift (shift.opened)' })
  @ApiCreatedResponse({ description: 'Shift opened.' })
  @ApiConflictResponse({ description: 'Staff already has an open shift.' })
  @Post('open')
  @RequirePermission('shift', 'open')
  async open(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: OpenShiftDto,
  ) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.shifts.open({ ...dto, staffId }, staffId, idempotencyKey);
  }

  @ApiOperation({
    summary: 'Close a cash shift with drawer reconciliation (shift.closed / cash.shortage)',
  })
  @ApiParam({ name: 'id', description: 'Cash shift id' })
  @ApiOkResponse({ description: 'Shift closed; diff recorded.' })
  @ApiConflictResponse({ description: 'Shift already closed.' })
  @ApiUnprocessableEntityResponse({
    description: 'Unknown shift, or a discrepancy with no reason (invariant #3).',
  })
  @Post(':id/close')
  @RequirePermission('shift', 'close')
  async close(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CloseShiftDto,
  ) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.shifts.close(id, dto, staffId, idempotencyKey, user.role);
  }

  @Post(':id/handover')
  @RequirePermission('shift', 'handover')
  async handover(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: HandoverShiftDto,
  ) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.shifts.handover(id, dto, staffId, user.role, idempotencyKey);
  }
}
