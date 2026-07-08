import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Customer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { AppleSocialLoginDto, TelegramSocialLoginDto } from './auth.dto';
import {
  SocialProfile,
  verifyAppleIdentityToken,
  verifyTelegramLogin,
} from './social-login';

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

  /** Issue an access-recovery OTP. Uses the same SMS channel without revealing account existence. */
  requestRecoveryOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
    return this.requestOtp(phone);
  }

  /**
   * Verify an OTP and log the customer in (find-or-create by phone). Wrong codes
   * increment an attempt counter and lock the challenge after OTP_MAX_ATTEMPTS; a
   * consumed or expired challenge cannot be reused.
   */
  async verifyOtp(phone: string, code: string): Promise<AuthTokens> {
    await this.consumeOtp(phone, code);
    const customer = await this.prisma.customer.upsert({
      where: { phone },
      update: {},
      create: { phone, name: '' },
    });
    return this.issueTokens(customer.id, customer.phone);
  }

  /**
   * Verify a recovery OTP for an existing account, revoke all old refresh tokens,
   * then issue a fresh pair. This is the safe "lost phone/session" path.
   */
  async verifyRecoveryOtp(phone: string, code: string): Promise<AuthTokens> {
    await this.consumeOtp(phone, code);
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (!customer) {
      throw new ValidationError('customer_not_found', 'Аккаунт не найден');
    }
    await this.prisma.refreshToken.updateMany({
      where: { customerId: customer.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(customer.id, customer.phone);
  }

  async loginWithTelegram(dto: TelegramSocialLoginDto): Promise<AuthTokens> {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new ValidationError(
        'social_provider_not_configured',
        'Telegram login is not configured',
      );
    }
    const maxAge = Number(
      this.config.get<string>('TELEGRAM_AUTH_MAX_AGE_SECONDS') ?? 24 * 60 * 60,
    );
    const profile = verifyTelegramLogin(
      {
        initData: dto.initData,
        source: dto.source,
        maxAgeSeconds: Number.isFinite(maxAge) ? maxAge : undefined,
      },
      botToken,
    );
    const customer = await this.customerForSocialProfile(profile);
    return this.issueTokens(customer.id, customer.phone);
  }

  async loginWithApple(dto: AppleSocialLoginDto): Promise<AuthTokens> {
    const clientId = this.config.get<string>('APPLE_CLIENT_ID');
    if (!clientId) {
      throw new ValidationError(
        'social_provider_not_configured',
        'Apple login is not configured',
      );
    }
    const profile = await verifyAppleIdentityToken({
      identityToken: dto.identityToken,
      clientId,
      nonce: dto.nonce,
      name: dto.name,
      jwksUrl: this.config.get<string>('APPLE_JWKS_URL'),
    });
    const customer = await this.customerForSocialProfile(profile);
    return this.issueTokens(customer.id, customer.phone);
  }

  private async consumeOtp(phone: string, code: string): Promise<void> {
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

  private async customerForSocialProfile(profile: SocialProfile): Promise<Customer> {
    const existing = await this.prisma.customerIdentity.findUnique({
      where: {
        provider_subject: {
          provider: profile.provider,
          subject: profile.subject,
        },
      },
      include: { customer: true },
    });
    if (existing) {
      await this.prisma.customerIdentity.update({
        where: { id: existing.id },
        data: {
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
      if (!existing.customer.name && profile.displayName) {
        return this.prisma.customer.update({
          where: { id: existing.customerId },
          data: { name: profile.displayName },
        });
      }
      return existing.customer;
    }

    return this.prisma.customer.create({
      data: {
        phone: socialPhone(profile.provider, profile.subject),
        name: profile.displayName ?? profile.email ?? `${profile.provider}:${profile.subject}`,
        segments: [`auth:${profile.provider}`],
        identities: {
          create: {
            provider: profile.provider,
            subject: profile.subject,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        },
      },
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

function socialPhone(provider: string, subject: string): string {
  const hex = createHash('sha256').update(`${provider}:${subject}`).digest('hex');
  const value = BigInt(`0x${hex.slice(0, 14)}`) % 10_000_000_000n;
  return `+999${value.toString().padStart(10, '0')}`;
}
