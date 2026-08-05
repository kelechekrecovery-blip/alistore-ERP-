import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ForbiddenError } from '../common/errors';
import type { AuthPrincipal } from '../auth/jwt.strategy';
import type { RegisterPushTokenDto } from './push-token.dto';
import type { Prisma } from '@prisma/client';
import { lockActiveCustomerOnTx } from '../auth/customer-session-state';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPushToken(dto: RegisterPushTokenDto, user?: AuthPrincipal) {
    return this.prisma.$transaction(async (tx) => {
      let binding: { scope: string; customerId: string | null; staffId: string | null };
      if (user?.typ === 'customer') {
        const customer = await lockActiveCustomerOnTx(tx, user.customerId);
        binding = { scope: 'customer', customerId: customer.id, staffId: null };
      } else {
        binding = await this.resolveBinding(user, tx);
      }
      return this.registerForBinding(dto, binding, tx);
    });
  }

  private async registerForBinding(
    dto: RegisterPushTokenDto,
    binding: { scope: string; customerId: string | null; staffId: string | null },
    db: Pick<Prisma.TransactionClient, 'pushToken' | '$queryRaw'>,
  ) {
    // Device tokens are global bearer-like identifiers. Serialize all customer
    // and staff registrations by token before the read/ownership-check/upsert,
    // otherwise concurrent first claims could both pass the empty read and the
    // second ON CONFLICT branch would silently steal the first owner's token.
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'push-token:' + dto.token}))::text AS locked`;
    const existing = await db.pushToken.findUnique({ where: { token: dto.token } });
    if (existing) this.assertTokenOwnership(existing, binding);
    const token = await db.pushToken.upsert({
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

  private async resolveBinding(
    user: AuthPrincipal | undefined,
    db: Pick<Prisma.TransactionClient, 'staffUser'>,
  ) {
    if (!user) {
      throw new UnauthorizedException('Для регистрации push-токена требуется авторизация');
    }

    if (user.typ === 'staff') {
      const staff = await db.staffUser.findUnique({
        where: { id: user.customerId },
        select: { id: true, active: true },
      });
      if (!staff?.active) {
        throw new ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
      }
      return { scope: 'staff', customerId: null, staffId: staff.id };
    }

    throw new UnauthorizedException('Для регистрации push-токена требуется авторизация');
  }

  /**
   * A token already bound to a different customer/staff principal must not be
   * re-bound (push hijack guard); the owner may refresh it, and an unbound
   * legacy token may be claimed by any authenticated principal.
   */
  private assertTokenOwnership(
    existing: { customerId: string | null; staffId: string | null },
    binding: { scope: string; customerId: string | null; staffId: string | null },
  ) {
    const ownedByOtherCustomer = existing.customerId !== null && existing.customerId !== binding.customerId;
    const ownedByOtherStaff = existing.staffId !== null && existing.staffId !== binding.staffId;
    if (ownedByOtherCustomer || ownedByOtherStaff) {
      throw new ConflictError('push_token_already_bound', 'Push-токен уже привязан к другому аккаунту');
    }
  }
}
