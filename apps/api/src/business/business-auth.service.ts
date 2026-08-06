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
  /**
   * Хэш заведомо недостижимого пароля — для выравнивания времени ответа.
   *
   * Значение постоянное: пересчитывать его на каждый вход значило бы платить
   * стоимость argon2 дважды там, где логин существует.
   */
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$c2FtZS10aW1pbmctcGFkZGluZw$3sPXBLmOYAaLNPDPHKcTBiUZLIvfB1IbCwzhSCa3M1o';

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

    // Хэш проверяем ВСЕГДА, даже когда логина нет.
    //
    // `argon2` намеренно медленный, и раньше он считался только для
    // существующего логина: несуществующий отвечал сразу после индексированного
    // поиска. По задержке было видно, какие магазины подключены, — форма входа
    // работала справочником. Сравнение с фиктивным хэшем выравнивает время;
    // текст отказа и так один на все причины.
    const hash = user?.passwordHash ?? BusinessAuthService.DUMMY_HASH;
    const passwordOk = await argon2.verify(hash, password).catch(() => false);
    if (!user || !user.active || !user.seller.active || !passwordOk) throw denied;
    return {
      typ: 'seller',
      userId: user.id,
      sellerId: user.seller.id,
      sellerName: user.seller.name,
      username: user.username,
    };
  }
}
