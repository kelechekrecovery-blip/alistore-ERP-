import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateMineReturnDto, CreateReturnDto, ReturnStatusDto } from './returns.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';

@ApiTags('returns')
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @ApiOperation({ summary: 'List returns of the authenticated customer' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: "The current customer's returns, newest first." })
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthPrincipal) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    return this.returns.listByCustomer(user.customerId);
  }

  @ApiOperation({ summary: 'Open an idempotent return for the authenticated customer' })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Customer-owned return created or replayed.' })
  @Post('mine')
  @UseGuards(JwtAuthGuard)
  createMine(
    @CurrentUser() user: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateMineReturnDto,
  ) {
    if (user.typ !== 'customer') throw new ForbiddenException('Требуется customer JWT');
    const key = requireIdempotencyKey(idempotencyKey);
    return this.returns.request(dto.orderId, dto.reason, user.customerId, user.customerId, key, dto.items);
  }

  @ApiOperation({ summary: 'List returns by status' })
  @ApiOkResponse({ description: 'Returns, newest first.' })
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('returns', 'read')
  list(@Query('status') status?: string) {
    return this.returns.list(status);
  }

  @ApiOperation({ summary: 'Get a return' })
  @ApiNotFoundResponse({ description: 'Return does not exist.' })
  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('returns', 'read')
  async get(@Param('id') id: string) {
    const ret = await this.returns.get(id);
    if (!ret) throw new NotFoundException(`Возврат ${id} не найден`);
    return ret;
  }

  @ApiOperation({ summary: 'Open a return request (return.requested)' })
  @ApiCreatedResponse({ description: 'Return created.' })
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateReturnDto) {
    if (user.typ !== 'customer') {
      throw new ForbiddenException('Требуется customer JWT');
    }
    return this.returns.request(dto.orderId, dto.reason, user.customerId, user.customerId, undefined, dto.items);
  }

  @ApiOperation({ summary: 'Advance a return through its status machine' })
  @ApiOkResponse({ description: 'Return status updated.' })
  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('returns', 'transition')
  transition(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ReturnStatusDto) {
    return this.returns.transition(id, dto.status, user.customerId, dto.location);
  }
}

function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new BadRequestException('Idempotency-Key обязателен');
  if (key.length > 128) throw new BadRequestException('Idempotency-Key слишком длинный');
  return key;
}
