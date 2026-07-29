import { Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, StaffUser } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../common/errors';
import { TotpService } from '../auth/totp.service';
import { AuditService } from '../audit/audit.service';
import { EventType } from '../audit/event-types';
import { resolveActiveStorePoint } from '../common/store-point-identity';
import { revokeTelegramAgentAccessOnTx } from '../telegram-agent/telegram-agent-revocation';

type StaffStorePoint = {
  id: string;
  code: string;
  name: string;
  inventoryLocation: string;
};

export interface StaffTokens {
  accessToken: string;
  refreshToken: string;
  staffId: string;
  username: string;
  role: Role;
  point: string;
  storePoint: StaffStorePoint;
  totpEnabled: boolean;
}

const STAFF_REFRESH_PREFIX = 'staff:';
/**
 * Сутки, а не месяц — сознательное расхождение с покупателем (`auth.service.ts`).
 *
 * Токен покупателя открывает его собственные заказы, и выкидывать его каждые
 * сутки значит терять корзину. Токен сотрудника открывает кассу, склад и
 * согласования, а кража ничем себя не проявляет: ротация выдаёт вору новый
 * токен так же охотно, как владельцу. Тридцать дней — это тридцать дней
 * незаметного доступа; сутки привязывают окно к рабочему циклу, где смена
 * и так начинается со входа.
 */
const STAFF_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

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
  async createStaff(username: string, password: string, role: Role, point?: string) {
    // Legacy tests provision accounts directly without going through an owner
    // form. Production callers must always make an explicit active selection.
    const requestedPoint = point?.trim()
      || (process.env.NODE_ENV === 'test' ? 'BISHKEK-1' : undefined);
    const storePoint = await resolveActiveStorePoint(
      this.prisma,
      requestedPoint,
      `Точка продаж «${requestedPoint ?? ''}» не найдена или отключена`,
    );
    const passwordHash = await argon2.hash(password);
    return this.prisma.staffUser.create({
      data: { username, passwordHash, role, point: storePoint.inventoryLocation },
    });
  }

  /** Bootstrap the first owner (only when no staff exist yet — chicken-and-egg). */
  /** Нужна ли первичная настройка — есть ли хоть одна учётка. */
  async needsBootstrap(): Promise<boolean> {
    return (await this.prisma.staffUser.count()) === 0;
  }

  async bootstrapOwner(username: string, password: string, point?: string) {
    const count = await this.prisma.staffUser.count();
    if (count > 0) {
      throw new ValidationError(
        'staff_already_bootstrapped',
        'Персонал уже создан — войдите владельцем и добавляйте через /staff-auth/staff',
      );
    }
    return this.createStaff(username, password, 'owner', point);
  }

  /** Staff login → JWT carrying the role (server-authoritative authorization). */
  /**
   * Вход сотрудника. При включённой 2FA код обязателен.
   *
   * F-14: раньше `login` проверял только пароль и сразу выдавал accessToken,
   * даже при `totpEnabled: true`. То есть двухфакторка не защищала ровно тот
   * вход, ради которого её включают: одобрение опасных действий код требовало, а
   * сам вход — нет.
   *
   * Порядок проверок намеренный: пароль первым. Иначе ответ отличал бы «пароль
   * верен, нужен код» от «пароль неверен» и стал бы оракулом для подбора.
   */
  async login(username: string, password: string, totp?: string): Promise<StaffTokens> {
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
    if (staff.totpEnabled) {
      this.assertLoginTotp(staff, totp);
    }
    return this.issueTokens(staff);
  }

  /**
   * Проверяет код входа — и намеренно НЕ гасит его.
   *
   * Гашение (`totpLastToken`) принадлежит step-up: оно не даёт одним кодом
   * одобрить два опасных действия. Если тем же слотом гасить вход, ломается
   * реальный сценарий «владелец вошёл и сразу одобрил возврат»: код уже потрачен
   * логином, и одобрение падает с `staff_2fa_token_reused` — на денежном
   * действии, из-за входа. Это поймалось не рассуждением, а падением
   * `approvals-reject-stepup`, где вход и step-up идут в одном 30-секундном окне.
   *
   * Повтор кода на самом входе прикрыт иначе: нужен ещё и пароль, окно кода —
   * 30 секунд, а на маршруте стоит лимит 10 попыток в минуту.
   */
  private assertLoginTotp(staff: StaffUser, totp?: string): void {
    if (!staff.totpSecret) {
      // totpEnabled без секрета — сломанная учётка; молча пускать нельзя.
      throw new UnauthorizedError('totp_required', 'Нужен код двухфакторной аутентификации');
    }
    const token = totp?.trim();
    if (!token) {
      throw new UnauthorizedError('totp_required', 'Нужен код двухфакторной аутентификации');
    }
    if (!this.totp.verify(token, staff.totpSecret)) {
      throw new UnauthorizedError('totp_invalid', 'Неверный код двухфакторной аутентификации');
    }
  }

  async refresh(refreshToken: string): Promise<StaffTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
      `;
      if (locked.length === 0) throw new ValidationError('staff_refresh_invalid', 'Staff-сессия недействительна');
      const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!record || record.expiresAt < new Date() || !record.customerId.startsWith(STAFF_REFRESH_PREFIX)) {
        throw new ValidationError('staff_refresh_invalid', 'Staff-сессия недействительна');
      }
      if (record.revokedAt) {
        await tx.refreshToken.updateMany({ where: { customerId: record.customerId, revokedAt: null }, data: { revokedAt: new Date() } });
        return { kind: 'reused' as const };
      }
      await tx.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
      const staff = await tx.staffUser.findUnique({ where: { id: record.customerId.slice(STAFF_REFRESH_PREFIX.length) } });
      if (!staff?.active) throw new ValidationError('staff_inactive', 'Сотрудник деактивирован');
      return { kind: 'rotated' as const, tokens: await this.issueTokens(staff, tx) };
    });
    if (outcome.kind === 'reused') throw new ValidationError('staff_refresh_reused', 'Повторное использование staff-сессии — вход выполнен заново');
    return outcome.tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(
    staff: StaffUser,
    db: Pick<Prisma.TransactionClient, 'refreshToken'> = this.prisma,
  ): Promise<StaffTokens> {
    const storePoint = await resolveActiveStorePoint(
      this.prisma,
      staff.point,
      'Назначенная сотруднику точка отключена',
    );
    const accessToken = await this.jwt.signAsync(
      {
        sub: staff.id,
        role: staff.role,
        typ: 'staff',
        point: storePoint.inventoryLocation,
        storePointId: storePoint.id,
      },
      { expiresIn: '15m' },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await db.refreshToken.create({
      data: {
        customerId: `${STAFF_REFRESH_PREFIX}${staff.id}`,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + STAFF_REFRESH_TTL_MS),
      },
    });
    return {
      accessToken,
      refreshToken,
      staffId: staff.id,
      username: staff.username,
      role: staff.role,
      point: storePoint.inventoryLocation,
      storePoint: {
        id: storePoint.id,
        code: storePoint.code,
        name: storePoint.name,
        inventoryLocation: storePoint.inventoryLocation,
      },
      totpEnabled: staff.totpEnabled,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Current staff profile for session refresh / UI gates. */
  async me(staffId: string) {
    const staff = await this.getActiveStaff(staffId);
    const storePoint = await resolveActiveStorePoint(this.prisma, staff.point, 'Назначенная сотруднику точка отключена');
    return {
      ...this.publicView(staff),
      storePoint: {
        id: storePoint.id,
        code: storePoint.code,
        name: storePoint.name,
        inventoryLocation: storePoint.inventoryLocation,
      },
    };
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
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${staff.id} FOR UPDATE`;
        await revokeTelegramAgentAccessOnTx(
          tx,
          { staffId: staff.id },
          'staff_totp_not_enabled',
        );
      });
      return this.publicView(staff);
    }
    if (!this.totp.verify(token, staff.totpSecret)) {
      throw new ForbiddenError('staff_2fa_invalid_token', 'Неверный код 2FA');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.staffUser.update({
        where: { id: staff.id },
        data: { totpEnabled: false, totpSecret: null, totpLastToken: null },
      });
      await revokeTelegramAgentAccessOnTx(
        tx,
        { staffId: staff.id },
        'staff_totp_disabled',
      );
      return result;
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
      await revokeTelegramAgentAccessOnTx(
        tx,
        { staffId: target.id },
        'staff_totp_reset',
      );
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
      await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${targetStaffId} FOR UPDATE`;
      const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
      if (!target) {
        throw new ValidationError('staff_not_found', 'Сотрудник не найден');
      }
      if (!target.active) {
        await revokeTelegramAgentAccessOnTx(
          tx,
          { staffId: target.id },
          'staff_deactivated',
        );
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
      await revokeTelegramAgentAccessOnTx(
        tx,
        { staffId: target.id },
        'staff_deactivated',
      );
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

  /**
   * STAFF-004: change a staff member's role (promote/demote). Guarded against
   * removing the last active owner so the system can never lock itself out of
   * staff:manage. No-op when the role is unchanged; ledger records from/to.
   */
  async changeRole(actorId: string, targetStaffId: string, role: Role) {
    const updated = await this.auditLedger().transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${targetStaffId} FOR UPDATE`;
      const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
      if (!target) throw new ValidationError('staff_not_found', 'Сотрудник не найден');
      if (target.role === role) {
        if (!['admin', 'owner'].includes(role)) {
          await revokeTelegramAgentAccessOnTx(
            tx,
            { staffId: target.id },
            'staff_role_revoked',
          );
        }
        return { result: target, events: [] };
      }
      if (target.role === 'owner') {
        const owners = await tx.staffUser.count({ where: { role: 'owner', active: true, id: { not: target.id } } });
        if (owners === 0) {
          throw new ConflictError('last_owner_protected', 'Нельзя снять роль у последнего активного владельца');
        }
      }
      const staff = await tx.staffUser.update({ where: { id: target.id }, data: { role } });
      if (!['admin', 'owner'].includes(role)) {
        await revokeTelegramAgentAccessOnTx(
          tx,
          { staffId: target.id },
          'staff_role_revoked',
        );
      }
      return {
        result: staff,
        events: [{
          type: EventType.StaffRoleChanged,
          actor: actorId,
          payload: { targetStaffId: target.id, username: target.username, from: target.role, to: role },
          refs: [target.id],
        }],
      };
    });
    return this.publicView(updated);
  }

  /** STAFF-004: bring a deactivated account back. Idempotent; ledger records it. */
  async reactivateStaff(actorId: string, targetStaffId: string) {
    const updated = await this.auditLedger().transaction(async (tx) => {
      const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
      if (!target) throw new ValidationError('staff_not_found', 'Сотрудник не найден');
      if (target.active) return { result: target, events: [] };
      const staff = await tx.staffUser.update({ where: { id: target.id }, data: { active: true } });
      return {
        result: staff,
        events: [{
          type: EventType.StaffReactivated,
          actor: actorId,
          payload: { targetStaffId: target.id, username: target.username },
          refs: [target.id],
        }],
      };
    });
    return this.publicView(updated);
  }

  /**
   * STAFF-004: admin password reset (forgotten password). Revokes every live
   * refresh session of the target in the same transaction, so a stolen session
   * dies with the old password. The ledger never sees the password itself.
   */
  async resetPasswordByAdmin(actorId: string, targetStaffId: string, password: string) {
    const passwordHash = await argon2.hash(password);
    const updated = await this.auditLedger().transaction(async (tx) => {
      const target = await tx.staffUser.findUnique({ where: { id: targetStaffId } });
      if (!target) throw new ValidationError('staff_not_found', 'Сотрудник не найден');
      const staff = await tx.staffUser.update({ where: { id: target.id }, data: { passwordHash } });
      await revokeTelegramAgentAccessOnTx(
        tx,
        { staffId: target.id },
        'staff_password_reset',
      );
      const revoked = await tx.refreshToken.updateMany({
        where: { customerId: `${STAFF_REFRESH_PREFIX}${target.id}`, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return {
        result: staff,
        events: [{
          type: EventType.StaffPasswordReset,
          actor: actorId,
          payload: { targetStaffId: target.id, username: target.username, revokedSessions: revoked.count },
          refs: [target.id],
        }],
      };
    });
    return this.publicView(updated);
  }

  /** STAFF-004: full roster incl. deactivated — hr/week shows active only. */
  async listStaff() {
    const staff = await this.prisma.staffUser.findMany({
      select: { id: true, username: true, role: true, point: true, active: true, totpEnabled: true },
      orderBy: [{ active: 'desc' }, { username: 'asc' }],
    });
    return staff;
  }

  /**
   * Active colleagues at a point a cash drawer can be handed to — minus the
   * caller. Deliberately narrow (one point, id/username/role only) so shift
   * handover doesn't need the owner-only `staff:manage` roster: a cashier can
   * pick the receiver without seeing the whole company.
   */
  async handoverTargets(point: string, excludeStaffId: string) {
    return this.prisma.staffUser.findMany({
      where: { point, active: true, id: { not: excludeStaffId } },
      select: { id: true, username: true, role: true },
      orderBy: { username: 'asc' },
    });
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
    await resolveActiveStorePoint(this.prisma, staff.point, 'Назначенная сотруднику точка отключена');
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
