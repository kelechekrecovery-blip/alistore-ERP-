import { Injectable } from '@nestjs/common';
import { GiftCard, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput, AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { paymentAccountCode, postAccountingEntryOnTx } from '../finance/accounting-journal';
import { recordCashDrawerMovementOnTx } from '../shifts/cash-drawer';
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

  async issue(
    dto: IssueGiftCardDto,
    actor: string,
    idempotencyKey?: string,
  ): Promise<GiftCardView> {
    // Выпуск карты — это выпуск денег, поэтому повтор обязан вернуть ту же
    // карту. Проверки по `code` ниже для этого недостаточно: когда код не
    // передан, `generateCode()` выдаёт новый на каждый вызов, и реплей от
    // дважды нажавшего кассира или ретрая сети проходил её насквозь — вторая
    // карта с полным балансом и вторая проводка в 2300. Обе внутренне
    // корректны, поэтому расхождения не видел ни один риск-сигнал.
    if (idempotencyKey) {
      const replay = await this.prisma.giftCard.findUnique({ where: { idempotencyKey } });
      if (replay) {
        // Тот же ключ с другими данными — не повтор, а другая операция.
        // Молча вернуть первую карту нельзя: кассир получил бы подтверждение на
        // одну сумму, держа в руках карту на другую.
        if (replay.initialBalance !== dto.amount) {
          throw new ConflictError(
            'giftcard_idempotency_conflict',
            `Ключ идемпотентности уже использован для карты на ${replay.initialBalance}`,
          );
        }
        return this.view(replay);
      }
    }

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
          idempotencyKey,
          initialBalance: dto.amount,
          balance: dto.amount,
          customerId: dto.customerId,
          issuedBy: actor,
          note: dto.note,
          expiresAt,
        },
      });
      // Выпуск карты — это выпуск денег, и он обязан иметь проводку.
      //
      // Раньше её не было вовсе: карта получала реальный баланс, а погашение
      // дебетовало счёт 2300 «Обязательства по подарочным картам»
      // (`payments.service.ts` postPaymentEntryOnTx) — обязательство, которое
      // никогда не кредитовалось. Счёт уходил в минус, и ни один риск-сигнал
      // этого не проверял. Кассир мог выпустить карту, погасить ею телефон, и в
      // отчётах это выглядело честной выручкой при пустой кассе.
      //
      // Проводка идёт в той же транзакции, что и сама карта: если она не
      // пройдёт, карты тоже не будет.
      const method = dto.method ?? 'cash';
      const entry = await postAccountingEntryOnTx(tx, {
        idempotencyKey: `accounting:giftcard.issued:${created.id}`,
        sourceType: 'giftcard.issued',
        sourceRef: created.id,
        description: `Выпуск подарочной карты ${created.code}`,
        documentAmount: dto.amount,
        baseAmount: dto.amount,
        occurredAt: created.createdAt,
        createdBy: actor,
        lines: [
          { accountCode: paymentAccountCode(method), debit: dto.amount, credit: 0, memo: 'Оплата подарочной карты' },
          { accountCode: '2300', debit: 0, credit: dto.amount, memo: 'Обязательство по подарочной карте' },
        ],
      });
      // Наличная оплата обязана быть видна в смене: проводка утверждает, что в
      // кассу пришли деньги, а `expectedCash` считал только Payment — вечером
      // кассир получал излишек ровно на сумму проданных за смену карт.
      if (method === 'cash') {
        await recordCashDrawerMovementOnTx(tx, {
          idempotencyKey: `drawer:giftcard.issued:${created.id}`,
          staffId: actor,
          amount: dto.amount,
          kind: 'giftcard_issue',
          sourceType: 'giftcard.issued',
          sourceRef: created.id,
          reason: `Продажа подарочной карты ${created.code}`,
          createdBy: actor,
          accountingEntryId: entry.id,
        });
      }
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
