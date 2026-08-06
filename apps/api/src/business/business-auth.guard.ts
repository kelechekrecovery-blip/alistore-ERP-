import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../auth/jwt-secret';
import type { AuthPrincipal } from '../auth/jwt.strategy';

/**
 * Страж кабинета партнёра — намеренно свой, а не общий `JwtAuthGuard`.
 *
 * Добавить `typ: 'seller'` в общую стратегию было бы короче на файл и опаснее
 * на весь проект: часть эндпоинтов защищена только `JwtAuthGuard` без проверки
 * типа, и партнёрский токен разом получил бы к ним доступ. Здесь же радиус
 * ровно один — эндпоинты кабинета, и токен партнёра нигде больше не проходит,
 * потому что общая стратегия его по-прежнему отвергает.
 */
@Injectable()
export class BusinessAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(private readonly jwt: JwtService, config: ConfigService) {
    this.secret = resolveJwtSecret(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthPrincipal;
    }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Требуется вход в AliStore Business');

    let payload: { sub?: string; typ?: string; sellerId?: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('Сессия истекла. Войдите снова');
    }
    // Токен магазина обязан нести и тип, и сам магазин. Токен без `sellerId` —
    // сломанный, а не «все магазины»: сервис по нему отдал бы весь каталог.
    if (payload.typ !== 'seller' || !payload.sellerId) {
      throw new UnauthorizedException('Требуется вход в AliStore Business');
    }
    request.user = {
      customerId: payload.sub ?? '',
      typ: 'seller',
      sellerId: payload.sellerId,
    } as AuthPrincipal;
    return true;
  }
}
