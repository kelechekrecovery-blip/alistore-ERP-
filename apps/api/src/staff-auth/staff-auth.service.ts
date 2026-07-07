import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';

export interface StaffTokens {
  accessToken: string;
  role: Role;
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
  ) {}

  /** Provision a staff account (owner tooling / seed). Password stored via argon2. */
  async createStaff(username: string, password: string, role: Role) {
    const passwordHash = await argon2.hash(password);
    return this.prisma.staffUser.create({
      data: { username, passwordHash, role },
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
    return { accessToken, role: staff.role };
  }
}
