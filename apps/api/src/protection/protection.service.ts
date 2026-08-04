import { Injectable } from '@nestjs/common';
import { ProtectionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RequestProtectionDto, UpdateProtectionDto } from './protection.dto';

const STAFF_TRANSITIONS: Record<ProtectionStatus, ProtectionStatus[]> = {
  requested: ['reviewing', 'offered', 'rejected'],
  reviewing: ['offered', 'rejected'],
  offered: ['rejected'],
  active: [],
  rejected: [],
  cancelled: [],
};

const RATE: Record<RequestProtectionDto['planType'], number> = {
  accidental_damage: 0.06,
  extended_warranty: 0.04,
  full_protection: 0.09,
};

@Injectable()
export class ProtectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  mine(customerId: string) {
    return this.prisma.deviceProtectionPolicy.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  list() {
    return this.prisma.deviceProtectionPolicy.findMany({
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async request(customerId: string, dto: RequestProtectionDto) {
    const unit = await this.prisma.deviceUnit.findUnique({
      where: { imei: dto.imei.trim() },
      include: { product: true },
    });
    if (!unit?.orderId || unit.status !== 'sold') {
      throw new ValidationError('protection_device_not_eligible', 'Устройство не найдено среди проданных');
    }
    const order = await this.prisma.order.findUnique({ where: { id: unit.orderId } });
    if (!order || order.customerId !== customerId) {
      throw new ForbiddenError('protection_device_owner_mismatch', 'Нельзя страховать чужое устройство');
    }
    const duplicate = await this.prisma.deviceProtectionPolicy.findFirst({
      where: { imei: unit.imei, status: { in: ['requested', 'reviewing', 'offered', 'active'] } },
    });
    if (duplicate) {
      throw new ConflictError('protection_already_exists', 'Для устройства уже есть активная заявка');
    }
    const durationFactor = dto.coverageMonths === 24 ? 1.7 : 1;
    const suggestedPremium = Math.max(
      1_000,
      Math.round((unit.product.price * RATE[dto.planType] * durationFactor) / 100) * 100,
    );

    return this.audit.transaction(async (tx) => {
      const policy = await tx.deviceProtectionPolicy.create({
        data: {
          customerId,
          orderId: order.id,
          imei: unit.imei,
          productName: unit.product.name,
          planType: dto.planType,
          deviceValue: unit.product.price,
          premium: suggestedPremium,
          coverageMonths: dto.coverageMonths,
        },
      });
      return {
        result: policy,
        events: [{
          type: EventType.ProtectionRequested,
          actor: customerId,
          payload: {
            policyId: policy.id,
            imei: policy.imei,
            planType: policy.planType,
            coverageMonths: policy.coverageMonths,
            suggestedPremium,
          },
          refs: [policy.id, customerId, order.id, unit.imei],
        }],
      };
    });
  }

  async update(id: string, dto: UpdateProtectionDto, actor: string) {
    return this.audit.transaction(async (tx) => {
      const policy = await tx.deviceProtectionPolicy.findUnique({ where: { id } });
      if (!policy) throw new ValidationError('protection_not_found', `Заявка ${id} не найдена`);
      const to = dto.status as ProtectionStatus;
      if (!STAFF_TRANSITIONS[policy.status].includes(to)) {
        throw new ConflictError('protection_illegal_transition', `${policy.status} → ${to} запрещён`);
      }
      const premium = dto.premium ?? policy.premium;
      if (to === 'offered' && premium === null) {
        throw new ValidationError('protection_premium_required', 'Укажите страховую премию');
      }
      const updated = await tx.deviceProtectionPolicy.update({
        where: { id },
        data: {
          status: to,
          premium,
          staffNote: dto.staffNote?.trim() || undefined,
        },
      });
      return {
        result: updated,
        events: [this.event(policy.id, policy.customerId, policy.status, to, actor)],
      };
    });
  }

  async accept(id: string, customerId: string) {
    return this.audit.transaction(async (tx) => {
      const policy = await tx.deviceProtectionPolicy.findUnique({ where: { id } });
      if (!policy) throw new ValidationError('protection_not_found', `Заявка ${id} не найдена`);
      if (policy.customerId !== customerId) {
        throw new ForbiddenError('protection_owner_mismatch', 'Нельзя активировать чужую защиту');
      }
      if (policy.status !== 'offered') {
        throw new ConflictError('protection_illegal_transition', `${policy.status} → active запрещён`);
      }
      const startsAt = new Date();
      const endsAt = new Date(startsAt);
      endsAt.setMonth(endsAt.getMonth() + policy.coverageMonths);
      const updated = await tx.deviceProtectionPolicy.update({
        where: { id },
        data: { status: 'active', startsAt, endsAt },
      });
      return {
        result: updated,
        events: [this.event(id, customerId, policy.status, 'active', customerId)],
      };
    });
  }

  private event(
    policyId: string,
    customerId: string,
    from: ProtectionStatus,
    to: ProtectionStatus,
    actor: string,
  ) {
    return {
      type: EventType.ProtectionUpdated,
      actor,
      payload: { policyId, from, to },
      refs: [policyId, customerId],
    };
  }
}
