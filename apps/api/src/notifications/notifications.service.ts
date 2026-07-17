import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenError, ValidationError } from '../common/errors';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import type { RegisterPushTokenDto } from './push-token.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPushToken(dto: RegisterPushTokenDto, user?: AuthPrincipal) {
    const binding = await this.resolveBinding(user);
    const token = await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      update: {
        platform: dto.platform,
        deviceId: dto.deviceId,
        appScope: binding.scope,
        customerId: binding.customerId,
        staffId: binding.staffId,
        enabled: true,
        lastSeenAt: new Date(),
      },
      create: {
        token: dto.token,
        platform: dto.platform,
        deviceId: dto.deviceId,
        appScope: binding.scope,
        customerId: binding.customerId,
        staffId: binding.staffId,
        enabled: true,
      },
    });

    return {
      id: token.id,
      token: token.token,
      platform: token.platform,
      deviceId: token.deviceId,
      scope: token.appScope,
      customerId: token.customerId,
      staffId: token.staffId,
      enabled: token.enabled,
      lastSeenAt: token.lastSeenAt.toISOString(),
    };
  }

  async listMine(customerId: string, limit = 50) {
    return this.prisma.customerNotification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async markRead(id: string, customerId: string) {
    const notification = await this.prisma.customerNotification.findFirst({
      where: { id, customerId },
    });
    if (!notification) throw new NotFoundException('Уведомление не найдено');
    if (!notification.readAt) {
      await this.prisma.customerNotification.update({
        where: { id: notification.id },
        data: { readAt: new Date() },
      });
    }
    return this.prisma.customerNotification.findUniqueOrThrow({ where: { id: notification.id } });
  }

  private async resolveBinding(user: AuthPrincipal | undefined) {
    if (!user) {
      return { scope: 'anonymous', customerId: null, staffId: null };
    }

    if (user.typ === 'customer') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: user.customerId },
        select: { id: true },
      });
      if (!customer) {
        throw new ValidationError('customer_not_found', 'Клиент не найден');
      }
      return { scope: 'customer', customerId: customer.id, staffId: null };
    }

    if (user.typ === 'staff') {
      const staff = await this.prisma.staffUser.findUnique({
        where: { id: user.customerId },
        select: { id: true, active: true },
      });
      if (!staff?.active) {
        throw new ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
      }
      return { scope: 'staff', customerId: null, staffId: staff.id };
    }

    return { scope: 'anonymous', customerId: null, staffId: null };
  }
}
