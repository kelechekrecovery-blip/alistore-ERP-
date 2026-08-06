import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { BusinessAuthService } from '../business/business-auth.service';

export interface OnboardSellerInput {
  name: string;
  slug: string;
  username: string;
  password: string;
}

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly businessAuth: BusinessAuthService,
  ) {}

  list() {
    return this.prisma.seller.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, active: true, createdAt: true },
    });
  }

  /**
   * Завести магазин-партнёра вместе с его первым логином.
   *
   * До этого партнёра можно было создать только скриптом или прямой записью в
   * базу — то есть в обход прав, аудита и любой проверки. Для операции, которая
   * выдаёт постороннему доступ к вашей витрине, это неприемлемо.
   *
   * Магазин и логин создаются одной транзакцией: «завёл наполовину» —
   * магазин без входа или вход без магазина — состояние, которое потом
   * разгребают руками.
   */
  async onboard(input: OnboardSellerInput, actor: string) {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    if (name.length < 2) throw new ValidationError('seller_name_invalid', 'Название короче двух символов');
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      throw new ValidationError('seller_slug_invalid', 'Ссылка — латиница, цифры и дефис, 2–40 символов');
    }

    // Хэш считаем ДО транзакции: argon2 намеренно медленный, и держать на нём
    // открытую транзакцию — занимать соединение на сотни миллисекунд впустую.
    const passwordHash = await this.businessAuth.hashPassword(input.username, input.password);
    const username = input.username.trim().toLowerCase();

    return this.audit.transaction(async (tx) => {
      // Занятые slug и логин ловим заранее, чтобы отдать понятную ошибку, а не
      // сырое нарушение уникальности. Гонку всё равно ловит индекс.
      if (await tx.seller.findUnique({ where: { slug } })) {
        throw new ValidationError('seller_slug_taken', `Ссылка ${slug} уже занята`);
      }
      if (await tx.sellerUser.findUnique({ where: { username } })) {
        throw new ValidationError('seller_username_taken', `Логин ${username} уже занят`);
      }

      const seller = await tx.seller.create({
        data: { name, slug },
        select: { id: true, name: true, slug: true, active: true, createdAt: true },
      });
      const user = await tx.sellerUser.create({
        data: { sellerId: seller.id, username, passwordHash },
        select: { id: true, username: true },
      });

      return {
        // Пароль и хэш наружу не отдаём ни в каком виде: владелец уже знает,
        // что ввёл, а хэш в ответе — подарок тому, кто перехватит вкладку.
        result: { seller, username: user.username },
        events: [
          {
            type: EventType.SellerOnboarded,
            actor,
            refs: [seller.id, user.id],
            payload: { name, slug, username },
          },
        ],
      };
    });
  }

  /**
   * Убедиться, что позиция принадлежит этому магазину, и вернуть её.
   *
   * Отказ — `NotFoundException`, а не `Forbidden`, и это не косметика. «Запрещено»
   * подтверждает, что товар с таким id существует: перебрав идентификаторы,
   * конкурент восстановил бы чужой ассортимент по одним кодам ответа. Для
   * магазина чужая позиция обязана выглядеть несуществующей.
   *
   * Товар AliStore (`sellerId = null`) для магазина тоже не существует: он не
   * его, и правило здесь ровно то же.
   */
  async assertOwns(sellerId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, sellerId } });
    if (!product) throw new NotFoundException(`Товар ${productId} не найден`);
    return product;
  }
}
