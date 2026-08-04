import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthPrincipal } from './jwt.strategy';

/**
 * Financial analytics can reconstruct a drawer even when shift reads are redacted.
 * Staff operating an open cash shift must finish the physical count first.
 */
@Injectable()
export class BlindCashReadGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (user?.typ !== 'staff') return true;
    const ownOpenShift = await this.prisma.cashShift.findFirst({
      where: { staffId: user.customerId, closedAt: null },
      select: { id: true },
    });
    if (ownOpenShift) {
      throw new ForbiddenException('Сначала завершите слепой пересчёт и закройте свою кассовую смену');
    }
    return true;
  }
}
