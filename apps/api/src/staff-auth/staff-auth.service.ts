import { Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, StaffUser } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ForbiddenError, ValidationError } from '../common/errors';
import { TotpService } from '../auth/totp.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';

export interface StaffTokens {
  accessToken: string;
  staffId: string;
  username: string;
  role: Role;
  point: string;
  totpEnabled: boolean;
}

/**
 * Staff authentication. Login issues a JWT that carries the staff role, so
 * dangerous actions are authorized on the server (Role Permission Matrix via
 * casbin PermissionGuard) instead of trusting `approverRole` from the request
 * body. Closes the P0 "authz not enforced" gap once the guard is applied.
 */
@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly totp: TotpService,
    // Optional: legacy unit wiring constructs the service without the ledger.
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** Provision a staff account (owner tooling / seed). Password stored via argon2. */
  async createStaff(username: string, password: string, role: Role, point = 'BISHKEK-1') {
    const passwordHash = await argon2.hash(password);
    return this.prisma.staffUser.create({
      data: { username, passwordHash, role, point: point.trim() || 'BISHKEK-1' },
    });
  }

  /** Bootstrap the first owner (only when no staff exist yet — chicken-and-egg). */
  async bootstrapOwner(username: string, password: string) {
    const count = await this.prisma.staffUser.count();
    if (count > 0) {
      throw new ValidationError(
        'staff_already_bootstrapped',
        'Персонал уже создан — войдите владельцем и добавляйте через /staff-auth/staff',
      );
    }
    return this.createStaff(username, password, 'owner');
  }

  /** Staff login → JWT carrying the role (server-authoritative authorization). */
  async login(username: string, password: string): Promise<StaffTokens> {
    const staff = await this.prisma.staffUser.findUnique({ where: { username } });
    const ok =
      staff && staff.active
        ? await argon2.verify(staff.passwordHash, password).catch(() => false)
        : false;
    if (!staff || !ok) {
      throw new ValidationError(
        'staff_invalid_credentials',
        'Неверный логин или пароль',
      );
    }
    const accessToken = await this.jwt.signAsync(
      { sub: staff.id, role: staff.role, typ: 'staff' },
      { expiresIn: '8h' },
    );
    return {
      accessToken,
      staffId: staff.id,
      username: staff.username,
      role: staff.role,
      point: staff.point,
      totpEnabled: staff.totpEnabled,
    };
  }

  /** Current staff profile for session refresh / UI gates. */
  async me(staffId: string) {
    return this.publicView(await this.getActiveStaff(staffId));
  }

  /** Start TOTP enrollment. Regenerating before enable invalidates older setup codes. */
  async setupTotp(staffId: string) {
    const staff = await this.getActiveStaff(staffId);
    if (staff.totpEnabled) {
      throw new ValidationError('staff_2fa_already_enabled', '2FA уже включена');
    }
    const secret = this.totp.generateSecret();
    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { totpSecret: secret, totpEnabled: false, totpLastToken: null },
    });
    return {
      secret,
      otpauthUrl: this.totp.keyUri(staff.username, 'AliStore', secret),
      totpEnabled: false,
    };
  }

  /** Verify the first authenticator code and mark staff 2FA as enabled. */
  async enableTotp(staffId: string, token: string) {
    const staff = await this.getActiveStaff(staffId);
    if (!staff.totpSecret) {
      throw new ValidationError(
        'staff_2fa_setup_required',
        'Сначала создайте секрет 2FA',
      );
    }
    if (!this.totp.verify(token, staff.totpSecret)) {
      throw new ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
    }
    const updated = await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { totpEnabled: true },
    });
    return this.publicView(updated);
  }

  /** Disable self 2FA after a valid current code. */
  async disableTotp(staffId: string, token: string) {
    const staff = await this.getActiveStaff(staffId);
    if (!staff.totpEnabled || !staff.totpSecret) {
      return this.publicView(staff);
    }
    if (!this.totp.verify(token, staff.totpSecret)) {
      throw new ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
    }
    const updated = await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { totpEnabled: false, totpSecret: null, totpLastToken: null },
    });
    return this.publicView(updated);
  }

  /**
   * STAFF-002: admin reset of a staff member's 2FA (lost authenticator) — no current
   * code required because the caller holds `staff:manage`. The TOTP secret is cleared
   * and the ledger event is written in the same transaction.
   * NOTE: this branch has no staff refresh tokens yet, so there are no sessions to
   * revoke — access JWTs die on expiry or on deactivation (STAFF-001).
   */
  async resetTotpByAdmin(actorId: string, targetStaffId: string) {
    const target = await this.getActiveStaff(targetStaffId);
    const updated = await this.auditLedger().transaction(async (tx) => {
      const staff = await tx.staffUser.update({
        where: { id: target.id },
        data: { totpEnabled: false, totpSecret: null, totpLastToken: null },
      });
      return {
        result: staff,
        events: [
          {
            type: EventType.StaffTotpReset,
            actor: actorId,
            payload: { targetStaffId: target.id, username: target.username },
            refs: [target.id],
          },
        ],
      };
    });
    return this.publicView(updated);
  }

  /**
   * STAFF-001: deactivate a staff account (dismissal). Blockers refuse with 409:
   * an open cash shift (hand over or close it first) and orders still with the
   * courier (courier_assigned / out_for_delivery). A clean deactivate flips
   * `active` and writes the ledger event in one transaction — the active-staff
   * guard and the login check cut access immediately. Re-deactivation is
   * idempotent: same result, no duplicate ledger event.
   */
  async deactivateStaff(actorId: string, targetStaffId: string) {
    const updated = await this.auditLedger().transaction(async (tx) => {
      const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
      if (!target) {
        throw new ValidationError('staff_not_found', 'Сотрудник не найден');
      }
      if (!target.active) {
        return { result: target, events: [] };
      }
      const [openShift, activeDeliveries] = await Promise.all([
        tx.cashShift.findFirst({
          where: { staffId: target.id, closedAt: null },
          select: { id: true },
        }),
        tx.order.findMany({
          where: {
            courierId: target.id,
            status: { in: ['courier_assigned', 'out_for_delivery'] },
          },
          select: { id: true, status: true },
        }),
      ]);
      const blockers: string[] = [];
      if (openShift) {
        blockers.push(`открытая кассовая смена ${openShift.id} — закройте или передайте смену (handover)`);
      }
      for (const order of activeDeliveries) {
        blockers.push(`активная доставка заказа ${order.id} (${order.status}) — переназначьте курьера`);
      }
      if (blockers.length > 0) {
        throw new ConflictError(
          'staff_deactivation_blocked',
          `Деактивация заблокирована: ${blockers.join('; ')}`,
        );
      }
      const staff = await tx.staffUser.update({
        where: { id: target.id },
        data: { active: false },
      });
      return {
        result: staff,
        events: [
          {
            type: EventType.StaffDeactivated,
            actor: actorId,
            payload: { targetStaffId: target.id, username: target.username },
            refs: [target.id],
          },
        ],
      };
    });
    return this.publicView(updated);
  }

  /** Step-up gate for approving dangerous actions. Rejecting remains fast. */
  async verifyStepUp(staffId: string, token?: string) {
    const staff = await this.getActiveStaff(staffId);
    if (!staff.totpEnabled || !staff.totpSecret) {
      throw new ForbiddenError(
        'staff_2fa_required',
        'Включите 2FA перед одобрением опасных действий',
      );
    }
    if (!token) {
      throw new ForbiddenError('staff_2fa_token_required', 'Введите код 2FA');
    }
    if (!this.totp.verify(token, staff.totpSecret)) {
      throw new ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
    }
    // Consume atomically: two concurrent approval requests carrying the same current code
    // cannot both pass after reading the same previous value.
    const consumed = await this.prisma.staffUser.updateMany({
      where: {
        id: staffId,
        OR: [{ totpLastToken: null }, { totpLastToken: { not: token } }],
      },
      data: { totpLastToken: token },
    });
    if (consumed.count === 0) {
      throw new ForbiddenError('staff_2fa_token_reused', 'Код уже использован — дождитесь нового');
    }
  }

  /** Transactional variant: a failed dangerous action rolls the consumed code back. */
  async verifyStepUpOnTx(tx: Prisma.TransactionClient, staffId: string, token?: string) {
    const staff = await tx.staffUser.findUnique({ where: { id: staffId } });
    if (!staff || !staff.active) {
      throw new ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
    }
    if (!staff.totpEnabled || !staff.totpSecret) {
      throw new ForbiddenError('staff_2fa_required', 'Включите 2FA перед одобрением опасных действий');
    }
    if (!token) {
      throw new ForbiddenError('staff_2fa_token_required', 'Введите код 2FA');
    }
    if (!this.totp.verify(token, staff.totpSecret)) {
      throw new ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
    }
    const consumed = await tx.staffUser.updateMany({
      where: {
        id: staffId,
        OR: [{ totpLastToken: null }, { totpLastToken: { not: token } }],
      },
      data: { totpLastToken: token },
    });
    if (consumed.count === 0) {
      throw new ForbiddenError('staff_2fa_token_reused', 'Код уже использован — дождитесь нового');
    }
  }

  private async getActiveStaff(staffId: string): Promise<StaffUser> {
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff || !staff.active) {
      throw new ForbiddenError('staff_not_found', 'Сотрудник не найден или отключён');
    }
    return staff;
  }

  /** The ledger is required for admin operations; the ctor param is @Optional for legacy wiring. */
  private auditLedger(): AuditService {
    if (!this.audit) {
      throw new Error('AuditService is not wired into StaffAuthService');
    }
    return this.audit;
  }

  /** Never expose the password hash or TOTP secret. */
  publicView(staff: StaffUser) {
    return {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      point: staff.point,
      active: staff.active,
      totpEnabled: staff.totpEnabled,
    };
  }
}
