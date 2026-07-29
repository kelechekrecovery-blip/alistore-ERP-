import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CancelOrderLineSupplyDto, PlaceOrderLineSupplyDto } from './order-line-supply.dto';
import { OrderLineSupplyService } from './order-line-supply.service';

/**
 * Staff-only surface over a single to-order line's supplier fulfillment
 * (docs/SUPPLY-TO-ORDER-PLAN.md, slice 3). Reuses the existing `procurement`
 * resource/action pairs rather than inventing a new permission axis.
 */
@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('orders/:orderId/items/:orderItemId/supply')
export class OrderLineSupplyController {
  constructor(private readonly supply: OrderLineSupplyService) {}

  @Post('order')
  @RequirePermission('procurement', 'create')
  place(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string, @Body() dto: PlaceOrderLineSupplyDto) {
    return this.supply.placeSupplierOrder(orderItemId, dto, user.customerId);
  }

  @Post('ship')
  @RequirePermission('procurement', 'send')
  ship(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string) {
    return this.supply.markInTransit(orderItemId, user.customerId);
  }

  @Post('receive')
  @RequirePermission('procurement', 'receive')
  receive(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string) {
    return this.supply.markReceived(orderItemId, user.customerId);
  }

  @Post('quality-check')
  @RequirePermission('procurement', 'receive')
  qualityCheck(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string) {
    return this.supply.markQualityChecked(orderItemId, user.customerId);
  }

  @Post('ready')
  @RequirePermission('procurement', 'receive')
  ready(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string) {
    return this.supply.markReady(orderItemId, user.customerId);
  }

  @Post('handover')
  @RequirePermission('procurement', 'receive')
  handover(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string) {
    return this.supply.markHandedOver(orderItemId, user.customerId);
  }

  @Post('cancel')
  @RequirePermission('procurement', 'cancel')
  cancel(@CurrentUser() user: AuthPrincipal, @Param('orderItemId') orderItemId: string, @Body() dto: CancelOrderLineSupplyDto) {
    return this.supply.cancel(orderItemId, dto, user.customerId);
  }
}
