import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import type { AuthPrincipal } from '../auth/jwt.strategy';

/** Позиция в кабинете партнёра: только то, чем он действительно распоряжается. */
export interface BusinessProductView {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: string;
  archived: boolean;
}

@Injectable()
export class BusinessProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Область запроса — только партнёрский токен.
   *
   * Кабинет это не «ERP с урезанными правами»: сотрудник AliStore ведёт каталог
   * своими экранами. Пускать сюда staff-токен значило бы завести второй путь к
   * тем же данным с другими проверками — а два пути расходятся всегда.
   */
  private scopeOf(principal: AuthPrincipal): string {
    if (principal.typ !== 'seller') {
      throw new ForbiddenException('Кабинет доступен только магазину-партнёру');
    }
    const sellerId = (principal as { sellerId?: string }).sellerId;
    // Токен без магазина — сломанный токен, а не «все магазины». Пустой фильтр
    // здесь отдал бы партнёру весь каталог.
    if (!sellerId) throw new ForbiddenException('Токен без магазина');
    return sellerId;
  }

  async list(principal: AuthPrincipal): Promise<BusinessProductView[]> {
    const sellerId = this.scopeOf(principal);
    const rows = await this.prisma.product.findMany({
      where: { sellerId },
      orderBy: [{ archived: 'asc' }, { name: 'asc' }],
      select: { id: true, sku: true, name: true, price: true, category: true, archived: true },
    });
    return rows;
  }

  /**
   * Сменить цену своей позиции.
   *
   * Чужая позиция отвечает «не найдено», а не «запрещено»: «запрещено»
   * подтверждает, что товар существует, и перебором id конкурент восстановил бы
   * чужой ассортимент по одним кодам ответа.
   *
   * Изменение пишется в Event Ledger вместе с прежней ценой: «кто и когда
   * уронил цену» — тот вопрос, который этой таблице зададут позже.
   */
  async updatePrice(principal: AuthPrincipal, productId: string, price: number) {
    const sellerId = this.scopeOf(principal);
    if (!Number.isInteger(price) || price < 1) {
      throw new ValidationError('price_invalid', 'Цена должна быть целым числом от 1 сома');
    }
    return this.audit.transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, sellerId } });
      if (!product) throw new NotFoundException(`Товар ${productId} не найден`);
      const updated = await tx.product.update({ where: { id: productId }, data: { price } });
      return {
        result: updated,
        events: [
          {
            type: EventType.PriceChanged,
            entityType: 'product',
            entityId: productId,
            actor: `seller:${sellerId}`,
            payload: { previousPrice: product.price, price, sellerId },
          },
        ],
      };
    });
  }
}
