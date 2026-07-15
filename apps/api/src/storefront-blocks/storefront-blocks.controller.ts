import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StorefrontBlockDevice } from '@prisma/client';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import {
  CreateStorefrontBlockDto,
  ReorderStorefrontBlocksDto,
  ScheduleStorefrontBlockDto,
  UpdateStorefrontBlockDto,
} from './storefront-blocks.dto';
import { StorefrontBlocksService } from './storefront-blocks.service';

@ApiTags('storefront-blocks')
@Controller('storefront-blocks')
export class StorefrontBlocksPublicController {
  constructor(private readonly blocks: StorefrontBlocksService) {}
  @Get('public')
  publicBlocks(@Query('device') device?: StorefrontBlockDevice) {
    return this.blocks.publicBlocks(device === 'mobile' || device === 'desktop' ? device : 'all');
  }
}

@ApiTags('storefront-blocks')
@ApiBearerAuth()
@Controller('storefront-blocks')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class StorefrontBlocksAdminController {
  constructor(private readonly blocks: StorefrontBlocksService) {}
  @Get() @RequirePermission('storefront', 'read') list() { return this.blocks.list(); }
  @Post() @RequirePermission('storefront', 'update') create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateStorefrontBlockDto) { return this.blocks.create(dto, user.customerId); }
  @Post('reorder') @RequirePermission('storefront', 'update') reorder(@CurrentUser() user: AuthPrincipal, @Body() dto: ReorderStorefrontBlocksDto) { return this.blocks.reorder(dto, user.customerId); }
  @Post(':id/update') @RequirePermission('storefront', 'update') update(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateStorefrontBlockDto) { return this.blocks.update(id, dto, user.customerId); }
  @Post(':id/publish') @RequirePermission('storefront', 'publish') publish(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.blocks.publish(id, user.customerId); }
  @Post(':id/schedule') @RequirePermission('storefront', 'publish') schedule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ScheduleStorefrontBlockDto) { return this.blocks.schedule(id, dto, user.customerId); }
  @Post(':id/cancel-schedule') @RequirePermission('storefront', 'publish') cancelSchedule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.blocks.cancelSchedule(id, user.customerId); }
  @Post(':id/archive') @RequirePermission('storefront', 'publish') archive(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) { return this.blocks.archive(id, user.customerId); }
}
