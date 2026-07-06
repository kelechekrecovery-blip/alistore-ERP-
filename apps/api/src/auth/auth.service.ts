import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 минут
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const ACCESS_TTL = '15m';

/**
 * Customer authentication by phone + OTP (Roadmap MVP: «вход по телефону+OTP»).
 * Access is a short-lived JWT; the refresh token is opaque, stored only as a
 * sha-256 hash and rotated (single-use) on every refresh so a leaked token can be
 * used at most once. Login is not a money/stock/status mutation, so it writes no
 * Event Ledger entry — the ledger stays reserved for those (see AuditService).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue a login OTP for a phone. The code is stored hashed and never logged.
   * In production it is delivered by SMS; for local dev/tests AUTH_OTP_DEV_ECHO
   * returns it in the response instead.
   */
  async requestOtp(
    phone: string,
  ): Promise<{ challengeId: string; devCode?: string }> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const challenge = await this.prisma.otpChallenge.create({
      data: { phone, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    // TODO: deliver via an SMS gateway (KG provider) behind an OtpSender port.
    const echo = this.config.get<string>('AUTH_OTP_DEV_ECHO') === 'true';
    return echo
      ? { challengeId: challenge.id, devCode: code }
      : { challengeId: challenge.id };
  }

  /**
   * Verify an OTP and log the customer in (find-or-create by phone). Wrong codes
   * increment an attempt counter and lock the challenge after OTP_MAX_ATTEMPTS; a
   * consumed or expired challenge cannot be reused.
   */
  async verifyOtp(phone: string, code: string): Promise<AuthTokens> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new ValidationError('otp_not_found', 'Код не найден или истёк');
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new ValidationError(
        'otp_locked',
        'Слишком много попыток, запросите новый код',
      );
    }

    const ok = await argon2.verify(challenge.codeHash, code).catch(() => false);
    if (!ok) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new ValidationError('otp_invalid', 'Неверный код');
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    const customer = await this.prisma.customer.upsert({
      where: { phone },
      update: {},
      create: { phone, name: '' },
    });
    return this.issueTokens(customer.id, customer.phone);
  }

  /** Rotate a refresh token: the presented token is revoked and a new pair issued. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new ValidationError('refresh_invalid', 'Refresh-токен недействителен');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const customer = await this.prisma.customer.findUnique({
      where: { id: record.customerId },
    });
    if (!customer) {
      throw new ValidationError('customer_not_found', 'Клиент не найден');
    }
    return this.issueTokens(customer.id, customer.phone);
  }

  /** Revoke a refresh token (logout). Idempotent. */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    customerId: string,
    phone: string,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: customerId, phone, typ: 'customer' },
      { expiresIn: ACCESS_TTL },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        customerId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
