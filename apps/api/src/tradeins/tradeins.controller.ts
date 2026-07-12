import { Body, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CreateTradeInDto, TradeInViewDto } from './tradeins.dto';
import { TradeInsService } from './tradeins.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { requireGuestCapability } from '../auth/guest-capability';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@ApiTags('tradeins')
@Controller('tradeins')
export class TradeInsController {
  constructor(private readonly tradeIns: TradeInsService) {}

  @ApiOperation({
    summary: 'Assess and contract a used-device buyback (trade-in)',
    description:
      'Creates TradeInDevice, assigns contractId, masks seller passport in the response, and writes tradein.assessed/tradein.contracted events.',
  })
  @ApiCreatedResponse({ type: TradeInViewDto })
  @ApiUnprocessableEntityResponse({ description: 'Customer does not exist or payload is invalid.' })
  @Post()
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // anti-abuse: public KYC/passport endpoint
  create(
    @Body() dto: CreateTradeInDto,
    @CurrentUser() user?: AuthPrincipal,
    @Headers('x-guest-capability') capability?: string,
  ) {
    if (user?.typ === 'staff') throw new ForbiddenException('Используйте /tradeins/intake');
    const customerId = user?.typ === 'customer' ? user.customerId : dto.customerId;
    if (user?.typ === 'customer' && dto.customerId !== customerId) {
      throw new ForbiddenException('Нельзя создать trade-in от имени другого клиента');
    }
    if (!user) requireGuestCapability(capability, 'tradeins:create', customerId);
    return this.tradeIns.create({ ...dto, customerId }, customerId);
  }

  @ApiOperation({
    summary: 'Staff intake for an in-store used-device buyback',
    description:
      'Same contract creation as customer self-service, but actor comes from the active staff JWT.',
  })
  @ApiCreatedResponse({ type: TradeInViewDto })
  @ApiUnprocessableEntityResponse({ description: 'Customer does not exist or payload is invalid.' })
  @Post('intake')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('tradeins', 'intake')
  intake(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateTradeInDto) {
    return this.tradeIns.create(dto, user.customerId);
  }

  @ApiOperation({ summary: 'Get a trade-in by id with protected fields masked' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: TradeInViewDto })
  @ApiNotFoundResponse({ description: 'Trade-in does not exist.' })
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('tradeins', 'read')
  async get(@Param('id') id: string) {
    const tradeIn = await this.tradeIns.get(id);
    if (!tradeIn) throw new NotFoundException(`Скупка ${id} не найдена`);
    return tradeIn;
  }
}
