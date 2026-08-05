import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma, TradeInDevice } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ValidationError } from '../common/errors';
import { OutboxService } from '../outbox/outbox.service';
import { enqueueConsentedCustomerNotice } from '../outbox/customer-notifications';
import { PrismaService } from '../prisma/prisma.service';
import { postAccountingEntryOnTx } from '../finance/accounting-journal';
import { INVENTORY_ASSET_ACCOUNT } from '../inventory/inventory-valuation';
import { recordCashDrawerMovementOnTx } from '../shifts/cash-drawer';
import { CreateTradeInDto, TradeInViewDto } from './tradeins.dto';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { SettingsService } from '../settings/settings.service';
import { tradeInEstimate, type TradeInGrade, type TradeInValuation } from './valuation';

type TradeInCreateInput = Omit<CreateTradeInDto, 'customerId'> & { customerId: string };

@Injectable()
export class TradeInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly outbox?: OutboxService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /**
   * Прайс выкупа из настроек. Ключи literal-ами намеренно: гейт
   * `settings-wired` проверяет, что объявленный параметр кто-то читает, и
   * шаблонные строки его обманывают.
   */
  private async valuation(): Promise<TradeInValuation> {
    const read = async (key: string): Promise<number | undefined> =>
      this.settings ? this.settings.value(key) : undefined;
    const [i15, i14, i13, i12, mac, ipad, pods, other, gradeB, gradeC, round] = await Promise.all([
      read('tradein.base.iphone_15_som'),
      read('tradein.base.iphone_14_som'),
      read('tradein.base.iphone_13_som'),
      read('tradein.base.iphone_12_som'),
      read('tradein.base.macbook_som'),
      read('tradein.base.ipad_som'),
      read('tradein.base.airpods_som'),
      read('tradein.base.default_som'),
      read('tradein.grade_b_bps'),
      read('tradein.grade_c_bps'),
      read('tradein.round_som'),
    ]);
    return {
      // Порядок значим: «iphone 15» обязан проверяться раньше «iphone 1».
      tiers: [
        { match: 'iphone 15', baseSom: i15 ?? 65_000 },
        { match: 'iphone 14', baseSom: i14 ?? 52_000 },
        { match: 'iphone 13', baseSom: i13 ?? 38_000 },
        { match: 'iphone 12', baseSom: i12 ?? 28_000 },
        { match: 'macbook', baseSom: mac ?? 70_000 },
        { match: 'ipad', baseSom: ipad ?? 32_000 },
        { match: 'airpods', baseSom: pods ?? 8_000 },
      ],
      defaultBaseSom: other ?? 30_000,
      gradeFactorsBps: { A: 10_000, B: gradeB ?? 8_200, C: gradeC ?? 6_200 },
      roundToSom: round ?? 500,
    };
  }

  /** Предварительная оценка для витрины — та же функция, что назначит выплату. */
  async estimate(model: string, grade: TradeInGrade): Promise<number> {
    return tradeInEstimate(model, grade, await this.valuation());
  }

  async get(id: string): Promise<TradeInViewDto | null> {
    const tradeIn = await this.prisma.tradeInDevice.findUnique({ where: { id } });
    return tradeIn ? this.view(tradeIn) : null;
  }

  async getOwned(id: string, customerId: string): Promise<TradeInViewDto | null> {
    const tradeIn = await this.prisma.tradeInDevice.findFirst({ where: { id, customerId } });
    return tradeIn ? this.view(tradeIn) : null;
  }

  async listByCustomer(customerId: string): Promise<TradeInViewDto[]> {
    const tradeIns = await this.prisma.tradeInDevice.findMany({
      where: { customerId },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return tradeIns.map((tradeIn) => this.view(tradeIn));
  }

  /**
   * `payout` отличает выкуп у прилавка от заявки клиента.
   *
   * `POST /tradeins` — самообслуживание: человек присылает заявку на оценку, и
   * деньги при этом не двигаются. `POST /tradeins/intake` — приёмка
   * сотрудником: аппарат забирают, наличные выдают из ящика. Денежный след
   * принадлежит только второму пути.
   */
  async create(dto: TradeInCreateInput, actor: string, idempotencyKey: string, payout = false): Promise<TradeInViewDto> {
    const key = idempotencyKey.trim();
    if (!key || key.length > 128) {
      throw new ValidationError('invalid_idempotency_key', 'Idempotency key должен быть от 1 до 128 символов');
    }
    const model = dto.model.trim();
    const sellerPassport = dto.sellerPassport.trim();
    if (!model || !sellerPassport) {
      throw new ValidationError('invalid_tradein_payload', 'Модель и паспорт продавца обязательны');
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${dto.customerId} не найден`);
    }
    const imei = this.cleanOptional(dto.imei);
    // Кто назначает сумму, зависит от пути, и разница здесь принципиальная.
    //
    // Приёмка у прилавка (`payout`): цену ставит мастер после осмотра аппарата.
    // Он аутентифицирован, у него право `tradeins:intake`, и он видит вещь
    // руками — подменять его оценку табличной значило бы сломать саму работу.
    //
    // Самообслуживание: эндпоинт публичный, и присланному числу верить нельзя —
    // иначе выплату себе назначает тот, кто её получит. Раньше сумму считал
    // браузер по таблице моделей, зашитой в страницу, и сервер записывал её в
    // договор как есть. Теперь считает сервер той же функцией, что и показывает
    // витрине в предварительной оценке.
    if (payout && (!Number.isInteger(dto.price) || (dto.price ?? 0) <= 0)) {
      throw new ValidationError('invalid_tradein_price', 'Для приёмки сотрудником укажите положительную цену');
    }
    const price = payout
      ? dto.price!
      : await this.estimate(model, dto.grade as TradeInGrade);
    if (!payout && price <= 0) {
      throw new ValidationError(
        'tradein_not_valued',
        'Эту модель нельзя оценить онлайн — оформите выкуп в магазине, оценку сделает мастер.',
      );
    }
    const input = { customerId: dto.customerId, model, imei, grade: dto.grade, price, sellerPassport };
    const existing = await this.prisma.tradeInDevice.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.replay(existing, input, payout);

    try {
      return await this.audit.transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`tradein:${key}`}))::text AS locked`;
        const replay = await tx.tradeInDevice.findUnique({ where: { idempotencyKey: key } });
        if (replay) return { result: this.replay(replay, input, payout), events: [] };

        const tradeIn = await tx.tradeInDevice.create({
          data: {
            customerId: input.customerId,
            model: input.model,
            imei: input.imei,
            grade: input.grade,
            price: input.price,
            sellerPassport: input.sellerPassport,
            contractId: this.contractId(),
            idempotencyKey: key,
          },
        });
        // Выкуп у клиента — это выдача денег из кассы, и до сих пор он не
        // создавал ни проводки, ни движения: кассир отдавал 40 000 сом за б/у
        // телефон, а система об этом не знала вовсе. Вечером в ящике
        // недоставало ровно суммы выкупов за смену, и при самозакрытии
        // расхождение получало системную причину.
        //
        // Аппарат приходуется на товарные запасы, деньги уходят из кассы.
        const entry = payout ? await postAccountingEntryOnTx(tx, {
          idempotencyKey: `accounting:tradein.buyback:${tradeIn.id}`,
          sourceType: 'tradein.buyback',
          sourceRef: tradeIn.id,
          description: `Выкуп ${tradeIn.model} по договору ${tradeIn.contractId}`,
          documentAmount: tradeIn.price,
          baseAmount: tradeIn.price,
          occurredAt: new Date(),
          createdBy: actor,
          lines: [
            { accountCode: INVENTORY_ASSET_ACCOUNT, debit: tradeIn.price, credit: 0, memo: 'Оприходование выкупленного устройства' },
            { accountCode: '1000', debit: 0, credit: tradeIn.price, memo: 'Выплата клиенту за trade-in' },
          ],
        }) : null;
        if (entry) {
          await recordCashDrawerMovementOnTx(tx, {
            idempotencyKey: `drawer:tradein.buyback:${tradeIn.id}`,
            staffId: actor,
            amount: -tradeIn.price,
            kind: 'tradein_buyback',
            sourceType: 'tradein.buyback',
            sourceRef: tradeIn.id,
            reason: `Выкуп ${tradeIn.model}`,
            createdBy: actor,
            accountingEntryId: entry.id,
          });
        }
        if (this.outbox) {
          await enqueueConsentedCustomerNotice(tx, this.outbox, {
            customerId: input.customerId,
            template: 'tradein_decision',
            payload: { tradeInId: tradeIn.id, contractId: tradeIn.contractId, price: tradeIn.price, model: tradeIn.model },
            transactional: true,
          });
        }

        return {
          result: this.view(tradeIn),
          events: [
            {
              type: EventType.TradeInAssessed,
              actor,
              payload: {
                tradeInId: tradeIn.id,
                customerId: input.customerId,
                model: input.model,
                imei: input.imei,
                grade: input.grade,
                price: input.price,
              },
              refs: this.refs(tradeIn.id, input.customerId, input.imei),
            },
            {
              type: EventType.TradeInContracted,
              actor,
              payload: {
                tradeInId: tradeIn.id,
                customerId: input.customerId,
                contractId: tradeIn.contractId,
                imei: input.imei,
              },
              refs: this.refs(tradeIn.id, input.customerId, input.imei),
            },
          ],
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.tradeInDevice.findUniqueOrThrow({ where: { idempotencyKey: key } });
        return this.replay(raced, input, payout);
      }
      throw error;
    }
  }

  private replay(
    tradeIn: TradeInDevice,
    input: { customerId: string; model: string; imei: string | null; grade: TradeInDevice['grade']; price: number; sellerPassport: string },
    comparePrice: boolean,
  ): TradeInViewDto {
    const matches =
      tradeIn.customerId === input.customerId &&
      tradeIn.model === input.model &&
      tradeIn.imei === input.imei &&
      tradeIn.grade === input.grade &&
      (!comparePrice || tradeIn.price === input.price) &&
      tradeIn.sellerPassport === input.sellerPassport;
    if (!matches) throw new ConflictError('idempotency_key_reused', 'Idempotency key уже использован с другим trade-in');
    return this.view(tradeIn);
  }

  private contractId(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `TI-${day}-${suffix}`;
  }

  private view(tradeIn: TradeInDevice): TradeInViewDto {
    return {
      id: tradeIn.id,
      customerId: tradeIn.customerId,
      model: tradeIn.model,
      imei: tradeIn.imei ?? null,
      grade: tradeIn.grade,
      price: tradeIn.price,
      contractId: tradeIn.contractId ?? null,
      sellerPassportMasked: this.maskPassport(tradeIn.sellerPassport),
    };
  }

  private maskPassport(value: string): string {
    if (value.length <= 4) return '*'.repeat(value.length);
    return `${value.slice(0, 3)}***${value.slice(-2)}`;
  }

  private cleanOptional(value?: string): string | null {
    const clean = value?.trim();
    return clean ? clean : null;
  }

  private refs(...values: Array<string | null>): string[] {
    return values.filter((value): value is string => Boolean(value));
  }
}

function isUniqueViolation(error: unknown): boolean {
  return isUniqueConstraintViolation(error);
}
