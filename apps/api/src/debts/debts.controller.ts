import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { DebtsService } from './debts.service';
import { CreateDebtDto, DebtPaymentDto } from './debts.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('debts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @ApiOperation({ summary: 'Book a debt/installment sale — over the limit returns 202 { approvalId }' })
  @ApiCreatedResponse({ description: 'Debt booked (within limit).' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown order.' })
  @Post()
  @RequirePermission('debts', 'create')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateDebtDto) {
    return this.debts.create(dto, user.customerId);
  }

  @ApiOperation({ summary: 'List debts (filter by customerId/status)' })
  @Get()
  @RequirePermission('debts', 'read')
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    return this.debts.list({ customerId, status });
  }

  @ApiOperation({ summary: 'Record a payment against a debt (settles at zero balance)' })
  @ApiOkResponse({ description: 'Payment recorded; balance reduced.' })
  @ApiConflictResponse({ description: 'Debt not open.' })
  @ApiUnprocessableEntityResponse({ description: 'Unknown debt or invalid amount.' })
  @Post(':id/payments')
  @RequirePermission('debts', 'pay')
  pay(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: DebtPaymentDto) {
    return this.debts.pay(id, dto, user.customerId);
  }
}
