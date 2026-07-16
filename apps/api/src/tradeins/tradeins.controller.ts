import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (user?.typ === 'staff') throw new ForbiddenException('Используйте /tradeins/intake');
    const key = requireIdempotencyKey(idempotencyKey);
    if (user?.typ === 'customer') {
      return this.tradeIns.create({ ...dto, customerId: user.customerId }, user.customerId, key);
    }
    const customerId = requiredCustomerId(dto.customerId);
    if (!user) requireGuestCapability(capability, 'tradeins:create', customerId);
    return this.tradeIns.create({ ...dto, customerId }, customerId, key);
  }

  @ApiOperation({ summary: 'List trade-ins of the authenticated customer' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: TradeInViewDto, isArray: true })
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    return this.tradeIns.listByCustomer(user.customerId);
  }

  @ApiOperation({ summary: 'Get one trade-in of the authenticated customer' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: TradeInViewDto })
  @ApiNotFoundResponse({ description: 'Trade-in does not exist or is not owned by the customer.' })
  @Get('mine/:id')
  @UseGuards(JwtAuthGuard)
  async mineOne(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    const tradeIn = await this.tradeIns.getOwned(id, user.customerId);
    if (!tradeIn) throw new NotFoundException(`Скупка ${id} не найдена`);
    return tradeIn;
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
  intake(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateTradeInDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = requireIdempotencyKey(idempotencyKey);
    const customerId = requiredCustomerId(dto.customerId);
    return this.tradeIns.create({ ...dto, customerId }, user.customerId, key);
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

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}

function requiredCustomerId(value: string | undefined): string {
  const customerId = value?.trim();
  if (!customerId) throw new BadRequestException('customerId обязателен для guest или staff intake');
  return customerId;
}
