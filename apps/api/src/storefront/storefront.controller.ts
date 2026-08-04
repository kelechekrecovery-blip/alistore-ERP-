import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateStorefrontContentDto, ScheduleStorefrontContentDto } from './storefront.dto';
import { ApprovalsService } from '../approvals/approvals.service';
import { StorefrontService } from './storefront.service';

@ApiTags('storefront')
@Controller('storefront')
export class StorefrontPublicController {
  constructor(private readonly storefront: StorefrontService) {}
  @Get('content') content() { return this.storefront.publicContent(); }
}

@ApiTags('storefront')
@ApiBearerAuth()
@Controller('storefront')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class StorefrontAdminController {
  constructor(private readonly storefront: StorefrontService, private readonly approvals: ApprovalsService) {}
  @Get('revisions') @RequirePermission('storefront', 'read') list() { return this.storefront.list(); }
  @Post('revisions') @RequirePermission('storefront', 'update') create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateStorefrontContentDto) { return this.storefront.createDraft(dto, user.customerId); }
  /**
   * Parks a four-eyes approval instead of going live. The public storefront is
   * served from the published revision, so a single marketer POST used to change
   * the homepage for every shopper with no second pair of eyes.
   */
  @Post('revisions/:id/publish')
  @HttpCode(202)
  @RequirePermission('storefront', 'publish')
  async publish(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    const parked = await this.approvals.request({
      action: 'storefront_publish',
      requester: user.customerId,
      reason: `Публикация ревизии витрины ${id}`,
      payload: { revisionId: id },
    });
    return { ...parked, action: 'storefront_publish' };
  }
  @Post('revisions/:id/schedule') @RequirePermission('storefront', 'publish') schedule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ScheduleStorefrontContentDto) { return this.storefront.schedule(id, dto, user.customerId); }
  @Post('revisions/:id/cancel-schedule') @RequirePermission('storefront', 'publish') cancelSchedule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.storefront.cancelSchedule(id, user.customerId); }
}
