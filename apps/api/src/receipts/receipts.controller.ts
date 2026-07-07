import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptData } from './receipts.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@Controller('receipts')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@RequirePermission('receipts', 'print')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** Render a receipt from ad-hoc data → SVG preview + ESC/POS (base64). */
  @Post('render')
  render(@Body() data: ReceiptData) {
    return this.receipts.render(data);
  }

  /** Render the receipt for an existing order (POS or web sale). */
  @Get('order/:orderId')
  renderOrder(@Param('orderId') orderId: string) {
    return this.receipts.renderOrder(orderId);
  }
}
