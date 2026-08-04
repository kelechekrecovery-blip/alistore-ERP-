import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PosService } from './pos.service';
import { PosCustomerLookupDto, PosSaleDto } from './pos.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { StaffAuthService } from '../staff-auth/staff-auth.service';
import { requireActiveStaff } from '../auth/staff-principal';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@ApiTags('pos')
@Controller('pos')
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @ApiOperation({ summary: 'Find an existing customer by exact phone for a counter sale' })
  @ApiBearerAuth()
  @Post('customers/lookup')
  @UseGuards(JwtAuthGuard, PermissionGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermission('pos', 'sale')
  async customer(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: PosCustomerLookupDto,
  ) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    return this.pos.findCustomer(dto.phone, staffId, dto.point, dto.clientSaleId);
  }

  @ApiOperation({
    summary: 'Complete a counter sale: customer→shift→assign IMEIs→order→reserve→pay',
  })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Sale completed; order paid, units sold, ledger written.' })
  @ApiAcceptedResponse({ description: 'Discount or margin breach — parked for approval (202 { approvalId }).' })
  @ApiConflictResponse({ description: 'Insufficient stock for a line.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid sale payload.' })
  @Post('sale')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('pos', 'sale')
  async sale(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: PosSaleDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const staffId = await requireActiveStaff(user, this.staffAuth);
    const result = await this.pos.sale({ ...dto, staffId });
    if (result.pendingApproval) res.status(HttpStatus.ACCEPTED);
    return result;
  }
}
