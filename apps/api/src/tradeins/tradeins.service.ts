import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { TradeInDevice } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTradeInDto, TradeInViewDto } from './tradeins.dto';

@Injectable()
export class TradeInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(id: string): Promise<TradeInViewDto | null> {
    const tradeIn = await this.prisma.tradeInDevice.findUnique({ where: { id } });
    return tradeIn ? this.view(tradeIn) : null;
  }

  async create(dto: CreateTradeInDto, actor = dto.customerId): Promise<TradeInViewDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new ValidationError('customer_not_found', `Клиент ${dto.customerId} не найден`);
    }
    const imei = this.cleanOptional(dto.imei);

    return this.audit.transaction(async (tx) => {
      const tradeIn = await tx.tradeInDevice.create({
        data: {
          customerId: dto.customerId,
          model: dto.model,
          imei,
          grade: dto.grade,
          price: dto.price,
          sellerPassport: dto.sellerPassport,
          contractId: this.contractId(),
        },
      });

      return {
        result: this.view(tradeIn),
        events: [
          {
            type: EventType.TradeInAssessed,
            actor,
            payload: {
              tradeInId: tradeIn.id,
              customerId: dto.customerId,
              model: dto.model,
              imei,
              grade: dto.grade,
              price: dto.price,
            },
            refs: this.refs(tradeIn.id, dto.customerId, imei),
          },
          {
            type: EventType.TradeInContracted,
            actor,
            payload: {
              tradeInId: tradeIn.id,
              customerId: dto.customerId,
              contractId: tradeIn.contractId,
              imei,
            },
            refs: this.refs(tradeIn.id, dto.customerId, imei),
          },
        ],
      };
    });
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
