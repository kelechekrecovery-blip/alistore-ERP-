import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { ReplaceSupplierOfferDto } from './supplier-offers.dto';
import { SupplierOffersService } from './supplier-offers.service';

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/supplier-offers')
export class SupplierOffersController {
  constructor(private readonly offers: SupplierOffersService) {}

  @Get(':productId')
  @RequirePermission('procurement', 'read')
  get(@Param('productId') productId: string) {
    return this.offers.getActive(productId);
  }

  @Put(':productId')
  @RequirePermission('procurement', 'create')
  replace(
    @CurrentUser() user: AuthPrincipal,
    @Param('productId') productId: string,
    @Body() dto: ReplaceSupplierOfferDto,
  ) {
    return this.offers.replace(productId, dto, user.customerId);
  }

  @Delete(':productId')
  @RequirePermission('procurement', 'cancel')
  deactivate(@CurrentUser() user: AuthPrincipal, @Param('productId') productId: string) {
    return this.offers.deactivate(productId, user.customerId);
  }
}

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/supply-integrity')
export class SupplyIntegrityController {
  constructor(private readonly offers: SupplierOffersService) {}

  @Get()
  @RequirePermission('procurement', 'read')
  check(@CurrentUser() user: AuthPrincipal) {
    return this.offers.integrity(user.customerId);
  }
}
