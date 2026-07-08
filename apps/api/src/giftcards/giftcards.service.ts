import { Injectable } from '@nestjs/common';
import { GiftCard, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { IssueGiftCardDto } from './giftcards.dto';

export interface GiftCardView {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  currency: string;
  status: string;
  customerId: string | null;
  expiresAt: Date | null;
  redeemable: boolean;
}

@Injectable()
export class GiftcardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async issue(dto: IssueGiftCardDto, actor: string): Promise<GiftCardView> {
    const code = normalizeCode(dto.code ?? this.generateCode());
    const existing = await this.prisma.giftCard.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictError('giftcard_code_exists', `Подарочная карта ${code} уже существует`);
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;

    const card = await this.audit.transaction(async (tx) => {
      const created = await tx.giftCard.create({
        data: {
          code,
          initialBalance: dto.amount,
          balance: dto.amount,
          customerId: dto.customerId,
          issuedBy: actor,
          note: dto.note,
          expiresAt,
        },
      });
      return {
        result: created,
        events: [
          {
            type: EventType.GiftCardIssued,
            actor,
            payload: {
              giftCardId: created.id,
              code,
              amount: dto.amount,
              customerId: dto.customerId ?? null,
              expiresAt: expiresAt?.toISOString() ?? null,
            },
            refs: [created.id, code, ...(dto.customerId ? [dto.customerId] : [])],
          },
        ],
      };
    });
    return this.view(card);
  }

  async getByCode(code: string): Promise<GiftCardView> {
    const card = await this.prisma.giftCard.findUnique({ where: { code: normalizeCode(code) } });
    if (!card) {
      throw new ValidationError('giftcard_not_found', 'Подарочная карта не найдена');
    }
    return this.view(card);
  }

  async redeemOnTx(
    tx: Prisma.TransactionClient,
    codeInput: string,
    orderId: string,
    amount: number,
    actor: string,
    events: AuditInput[],
  ): Promise<GiftCard> {
    if (amount <= 0) {
      throw new ValidationError('invalid_giftcard_amount', 'Сумма списания должна быть больше 0');
    }
    const code = normalizeCode(codeInput);
    const now = new Date();
    const { count } = await tx.giftCard.updateMany({
      where: {
        code,
        status: 'active',
        balance: { gte: amount },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { balance: { decrement: amount } },
    });
    if (count === 0) {
      await this.raiseRedeemError(tx, code, amount, now);
    }

    let card = await tx.giftCard.findUnique({ where: { code } });
    if (!card) {
      throw new ValidationError('giftcard_not_found', 'Подарочная карта не найдена');
    }
    if (card.balance === 0 && card.status === 'active') {
      card = await tx.giftCard.update({
        where: { id: card.id },
        data: { status: 'redeemed' },
      });
    }

    events.push({
      type: EventType.GiftCardRedeemed,
      actor,
      payload: {
        giftCardId: card.id,
        code,
        orderId,
        amount,
        balance: card.balance,
      },
      refs: [card.id, code, orderId],
    });
    return card;
  }

  private async raiseRedeemError(
    tx: Prisma.TransactionClient,
    code: string,
    amount: number,
    now: Date,
  ): Promise<never> {
    const card = await tx.giftCard.findUnique({ where: { code } });
    if (!card) {
      throw new ValidationError('giftcard_not_found', 'Подарочная карта не найдена');
    }
    if (card.status !== 'active') {
      throw new ConflictError('giftcard_not_active', `Подарочная карта уже ${card.status}`);
    }
    if (card.expiresAt && card.expiresAt <= now) {
      await tx.giftCard.update({ where: { id: card.id }, data: { status: 'expired' } });
      throw new ConflictError('giftcard_expired', 'Срок действия подарочной карты истёк');
    }
    if (card.balance < amount) {
      throw new ConflictError(
        'giftcard_insufficient_balance',
        `На подарочной карте осталось ${card.balance}`,
      );
    }
    throw new ConflictError('giftcard_not_redeemable', 'Подарочную карту нельзя списать');
  }

  private view(card: GiftCard): GiftCardView {
    return {
      id: card.id,
      code: card.code,
      initialBalance: card.initialBalance,
      balance: card.balance,
      currency: card.currency,
      status: card.status,
      customerId: card.customerId,
      expiresAt: card.expiresAt,
      redeemable: card.status === 'active' && card.balance > 0 && (!card.expiresAt || card.expiresAt > new Date()),
    };
  }

  private generateCode(): string {
    return `GC-${randomBytes(6).toString('hex').toUpperCase()}`;
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
