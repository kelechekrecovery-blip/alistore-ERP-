import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SupportService } from './support.service';
import { EscalateTicketDto, OpenTicketDto, TicketTransitionDto } from './support.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { AuthzService } from '../authz/authz.service';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireGuestCapability } from '../auth/guest-capability';

@ApiTags('support')
@Controller('support/tickets')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly staffAuth: StaffAuthService,
    private readonly authz: AuthzService,
  ) {}

  @ApiOperation({ summary: 'Open a support ticket (SLA from priority, ticket.created)' })
  @ApiCreatedResponse({ description: 'Ticket opened.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown customer.' })
  @Post()
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  open(
    @Body() dto: OpenTicketDto,
    @CurrentUser() user?: AuthPrincipal,
    @Headers('x-guest-capability') capability?: string,
  ) {
    if (user?.typ === 'customer' && dto.customerId !== user.customerId) {
      throw new ForbiddenException('Нельзя открыть тикет от имени другого клиента');
    }
    const customerId = user?.typ === 'customer' ? user.customerId : dto.customerId;
    if (!user) requireGuestCapability(capability, 'support:create', customerId);
    if (user?.typ === 'staff') throw new ForbiddenException('Используйте staff support workflow');
    return this.support.open({ ...dto, customerId }, customerId);
  }

  @ApiOperation({ summary: 'List tickets (filter by customerId/status), SLA-first' })
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @CurrentUser() user: AuthPrincipal | undefined,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    if (customerId) {
      if (user?.typ === 'customer') {
        if (user.customerId !== customerId) {
          throw new ForbiddenException('Нельзя читать тикеты другого клиента');
        }
      } else {
        await this.requireStaffPermission(user, 'read');
      }
    } else {
      await this.requireStaffPermission(user, 'read');
    }
    return this.support.list({ customerId, status });
  }

  @ApiOperation({ summary: 'Advance a ticket through its status machine' })
  @ApiOkResponse({ description: 'Ticket transitioned.' })
  @ApiConflictResponse({ description: 'Illegal transition.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown ticket.' })
  @Patch(':id/transition')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('support', 'transition')
  transition(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: TicketTransitionDto) {
    return this.support.transition(id, dto.to, dto, user.customerId);
  }

  @ApiOperation({ summary: 'Escalate a ticket one priority step (ticket.escalated)' })
  @ApiOkResponse({ description: 'Ticket escalated.' })
  @ApiConflictResponse({ description: 'Ticket closed/resolved or already at max priority.' })
  @Patch(':id/escalate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('support', 'escalate')
  escalate(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() _dto: EscalateTicketDto) {
    return this.support.escalate(id, user.customerId);
  }

  private async requireStaffPermission(user: AuthPrincipal | undefined, action: string) {
    if (user?.typ !== 'staff' || !user.role) {
      throw new ForbiddenException('Требуется staff JWT');
    }
    await this.staffAuth.me(user.customerId);
    if (!(await this.authz.can(user.role, 'support', action))) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
  }
}
