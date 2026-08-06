import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';

/** Сессия партнёра. `typ` намеренно свой — staff-эндпоинты его не примут. */
export interface BusinessSession {
  typ: 'seller';
  userId: string;
  sellerId: string;
  sellerName: string;
  username: string;
}

/**
 * Вход в AliStore Business.
 *
 * Отдельный контур от `StaffAuthService`, и это не дублирование ради красоты.
 * Партнёр не имеет отношения к ERP, POS и кассе; общая таблица пользователей
 * означала бы общий контур прав, где одна забытая проверка роли открывает
 * чужому магазину склад и деньги AliStore. Разные таблицы и разный `typ`
 * токена делают такую ошибку невозможной по построению, а не по внимательности.
 */
@Injectable()
export class BusinessAuthService {
  private static readonly MIN_PASSWORD = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Проверить логин и пароль и вернуть хэш — без записи в базу.
   *
   * Нужен заведению магазина: argon2 намеренно медленный, и считать его внутри
   * открытой транзакции значит держать соединение занятым сотни миллисекунд
   * впустую. Правила длины живут здесь же, чтобы не разъехаться с `createUser`.
   */
  async hashPassword(username: string, password: string): Promise<string> {
    const login = username.trim().toLowerCase();
    if (login.length < 3) {
      throw new ValidationError('username_invalid', 'Логин короче трёх символов');
    }
    if (password.length < BusinessAuthService.MIN_PASSWORD) {
      throw new ValidationError(
        'password_too_short',
        `Пароль короче ${BusinessAuthService.MIN_PASSWORD} символов`,
      );
    }
    return argon2.hash(password);
  }

  async createUser(sellerId: string, username: string, password: string) {
    const login = username.trim().toLowerCase();
    if (login.length < 3) {
      throw new ValidationError('username_invalid', 'Логин короче трёх символов');
    }
    if (password.length < BusinessAuthService.MIN_PASSWORD) {
      throw new ValidationError(
        'password_too_short',
        `Пароль короче ${BusinessAuthService.MIN_PASSWORD} символов`,
      );
    }
    return this.prisma.sellerUser.create({
      data: { sellerId, username: login, passwordHash: await argon2.hash(password) },
    });
  }

  /**
   * Проверить логин и пароль.
   *
   * Один и тот же отказ на «нет такого логина», «неверный пароль» и «доступ
   * выключен»: разные сообщения превратили бы форму входа в справочник о том,
   * какие магазины подключены и какие учётки живы.
   */
  async login(username: string, password: string): Promise<BusinessSession> {
    const denied = new UnauthorizedException('Неверный логин или пароль');
    const user = await this.prisma.sellerUser.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { seller: { select: { id: true, name: true, active: true } } },
    });
    if (!user || !user.active || !user.seller.active) throw denied;
    if (!(await argon2.verify(user.passwordHash, password))) throw denied;
    return {
      typ: 'seller',
      userId: user.id,
      sellerId: user.seller.id,
      sellerName: user.seller.name,
      username: user.username,
    };
  }
}
