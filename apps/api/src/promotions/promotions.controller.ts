import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreatePromotionDto, PromotionQuoteDto, UpdatePromotionDto } from './promotions.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionsPublicController {
  constructor(private readonly promotions: PromotionsService) {}

  @Post('quote')
  @UseGuards(OptionalJwtAuthGuard)
  quote(@CurrentUser() user: AuthPrincipal | undefined, @Body() dto: PromotionQuoteDto) {
    return this.promotions.quote(dto, user?.typ === 'customer' ? user.customerId : undefined);
  }
}

@ApiTags('promotions')
@ApiBearerAuth()
@Controller('promotions')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class PromotionsAdminController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get() @RequirePermission('storefront', 'read') list() { return this.promotions.list(); }
  @Post() @RequirePermission('storefront', 'update') create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreatePromotionDto) { return this.promotions.create(dto, user.customerId); }
  @Post(':id/update') @RequirePermission('storefront', 'update') update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdatePromotionDto) { return this.promotions.update(id, dto, user.customerId); }
  @Post(':id/activate') @RequirePermission('storefront', 'publish') activate(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.promotions.activate(id, user.customerId); }
  @Post(':id/pause') @RequirePermission('storefront', 'publish') pause(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.promotions.pause(id, user.customerId); }
}
