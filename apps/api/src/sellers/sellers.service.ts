import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.seller.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
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
