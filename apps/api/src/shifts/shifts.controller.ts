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
  ApiHeader,
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
import { ValidationError } from '../common/errors';

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
    const staff = await this.staffAuth.me(await requireActiveStaff(user, this.staffAuth));
    return this.shifts.openShifts(point, staff.id, staff.role, staff.point);
  }

  @ApiOperation({ summary: 'Get a cash shift; the caller’s own open drawer is redacted' })
  @ApiParam({ name: 'id', description: 'Cash shift id' })
  @ApiOkResponse({ description: 'Shift found.' })
  @ApiNotFoundResponse({ description: 'Shift does not exist.' })
  @Get(':id')
  @RequirePermission('shift', 'read')
  async get(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    const shift = await this.shifts.getForStaff(id, staffId, user.role);
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
    const staff = await this.staffAuth.me(await requireActiveStaff(user, this.staffAuth));
    return this.shifts.open(
      { ...dto, staffId: staff.id, point: staff.point },
      staff.id,
      idempotencyKey,
    );
  }

  @ApiOperation({
    summary: 'Close a cash shift with a blind physical count (shift.closed / cash.shortage)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable retry key, maximum 100 characters.' })
  @ApiParam({ name: 'id', description: 'Cash shift id' })
  @ApiCreatedResponse({ description: 'Shift closed; diff recorded.' })
  @ApiConflictResponse({ description: 'Shift already closed.' })
  @ApiNotFoundResponse({ description: 'Shift does not exist or is not accessible.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid counted amount or manager reconciliation reason.' })
  @Post(':id/close')
  @RequirePermission('shift', 'close')
  async close(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CloseShiftDto,
  ) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new ValidationError('idempotency_key_required', 'Требуется Idempotency-Key до 100 символов');
    }
    return this.shifts.close(id, dto, staffId, key, user.role);
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
