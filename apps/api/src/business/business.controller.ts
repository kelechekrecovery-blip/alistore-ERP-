import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { BusinessAuthService } from './business-auth.service';
import { BusinessProductsService } from './business-products.service';
import { BusinessAuthGuard } from './business-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPrincipal } from '../auth/jwt.strategy';

class BusinessLoginDto {
  @IsString() @MinLength(3) username!: string;
  @IsString() @MinLength(1) password!: string;
}

class UpdatePriceDto {
  @IsInt() @Min(1) price!: number;
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
    private readonly jwt: JwtService,
  ) {}

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
