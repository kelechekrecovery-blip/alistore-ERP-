import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { BusinessAuthService } from './business-auth.service';
import { BusinessProductsService } from './business-products.service';
import { BusinessAuthGuard } from './business-auth.guard';
import { SellersService } from '../sellers/sellers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';

class BusinessLoginDto {
  @IsString() @MinLength(3) username!: string;
  @IsString() @MinLength(1) password!: string;
}

class UpdatePriceDto {
  @IsInt() @Min(1) price!: number;
}

class OnboardSellerDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsString() @MinLength(3) username!: string;
  // Планка та же, что в BusinessAuthService: партнёру выдают доступ к вашей
  // витрине, и короткий пароль здесь дороже неудобства при заведении.
  @IsString() @MinLength(10) password!: string;
}

/**
 * AliStore Business — кабинет магазина-партнёра.
 *
 * Отдельное приложение, а не вкладка ERP. Партнёр не имеет отношения к ERP, POS
 * и кассе, и это граница безопасности: общий контур означал бы, что одна
 * забытая проверка роли открывает чужому магазину склад и деньги AliStore.
 */
@ApiTags('AliStore Business')
@Controller('business')
export class BusinessController {
  constructor(
    private readonly auth: BusinessAuthService,
    private readonly products: BusinessProductsService,
    private readonly sellers: SellersService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Завести магазин-партнёра. Только владелец.
   *
   * Право `staff:manage` намеренно: выдать постороннему доступ к витрине — то
   * же по весу действие, что завести сотрудника, и держать его ниже значило бы
   * позволить админу подключить чужой магазин молча.
   */
  @Post('sellers')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('staff', 'manage')
  @ApiOperation({ summary: 'Завести магазин-партнёра и его первый логин' })
  onboard(@CurrentUser() user: AuthPrincipal, @Body() dto: OnboardSellerDto) {
    return this.sellers.onboard(dto, user.customerId);
  }

  @Get('sellers')
  @UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
  @RequirePermission('reports', 'read')
  @ApiOperation({ summary: 'Список подключённых магазинов' })
  listSellers() {
    return this.sellers.list();
  }

  @Post('auth/login')
  // Единственный логин в проекте, оставшийся без защиты от перебора: пароль
  // партнёра можно было подбирать с любой скоростью, какую пустит сеть.
  // Планка та же, что у входа сотрудника (`staff-auth.controller.ts`).
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Вход магазина-партнёра' })
  async login(@Body() dto: BusinessLoginDto) {
    const session = await this.auth.login(dto.username, dto.password);
    // `typ: 'seller'` не принимает ни один staff- или customer-эндпоинт:
    // общая JWT-стратегия по-прежнему пускает только те два типа.
    const accessToken = await this.jwt.signAsync(
      { sub: session.userId, typ: 'seller', sellerId: session.sellerId },
      { expiresIn: '8h' },
    );
    return { accessToken, seller: { id: session.sellerId, name: session.sellerName }, username: session.username };
  }

  @Get('products')
  @UseGuards(BusinessAuthGuard)
  @ApiOperation({ summary: 'Свой ассортимент' })
  @ApiOkResponse({ description: 'Позиции этого магазина и только они.' })
  list(@CurrentUser() user: AuthPrincipal) {
    return this.products.list(user);
  }

  @Patch('products/:id/price')
  @UseGuards(BusinessAuthGuard)
  @ApiOperation({ summary: 'Сменить цену своей позиции' })
  updatePrice(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdatePriceDto) {
    return this.products.updatePrice(user, id, dto.price);
  }
}
