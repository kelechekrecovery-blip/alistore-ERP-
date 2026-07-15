import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreateStorefrontContentDto } from './storefront.dto';
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
  constructor(private readonly storefront: StorefrontService) {}
  @Get('revisions') @RequirePermission('storefront', 'read') list() { return this.storefront.list(); }
  @Post('revisions') @RequirePermission('storefront', 'update') create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateStorefrontContentDto) { return this.storefront.createDraft(dto, user.customerId); }
  @Post('revisions/:id/publish') @RequirePermission('storefront', 'publish') publish(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.storefront.publish(id, user.customerId); }
}
