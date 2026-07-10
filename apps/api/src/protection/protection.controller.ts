import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { RequestProtectionDto, UpdateProtectionDto } from './protection.dto';
import { ProtectionService } from './protection.service';

@ApiTags('protection')
@ApiBearerAuth()
@Controller('protection/policies')
export class ProtectionController {
  constructor(private readonly protection: ProtectionService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.protection.mine(this.customerId(user));
  }

  @Post()
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ description: 'Protection request created and ledgered.' })
  request(@CurrentUser() user: AuthPrincipal, @Body() dto: RequestProtectionDto) {
    return this.protection.request(this.customerId(user), dto);
  }

  @Patch(':id/accept')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.protection.accept(id, this.customerId(user));
  }

  @Get()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('protection', 'read')
  @ApiOperation({ summary: 'Staff protection request queue' })
  list() {
    return this.protection.list();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('protection', 'update')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateProtectionDto,
  ) {
    return this.protection.update(id, dto, user.customerId);
  }

  private customerId(user: AuthPrincipal) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    return user.customerId;
  }
}
