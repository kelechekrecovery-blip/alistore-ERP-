import { Inject, Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { AppleSocialLoginDto, TelegramSocialLoginDto } from './auth.dto';
import {
  SocialProfile,
  verifyAppleIdentityToken,
  verifyTelegramLogin,
} from './social-login';
import { NoopOtpSender } from './noop-otp.sender';
import { OTP_SENDER, OtpSender } from './otp-sender';
import {
  EMAIL_OTP_SENDER,
  EmailOtpSender,
  NoopEmailOtpSender,
} from './email-otp.sender';
import type { AuthPrincipal, JwtPayload } from './jwt.strategy';

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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender = new NoopOtpSender(),
    @Optional()
    @Inject(EMAIL_OTP_SENDER)
    private readonly emailOtpSender: EmailOtpSender = new NoopEmailOtpSender(),
  ) {}

  /** Verify a short-lived access token for non-HTTP transports (for example Socket.IO). */
  async verifyAccessToken(token: string): Promise<AuthPrincipal> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(token);
    if (!payload.sub || !['customer', 'staff'].includes(payload.typ)) {
      throw new ValidationError('access_token_invalid', 'Недействительный access-токен');
    }
    return {
      customerId: payload.sub,
      phone: payload.phone,
      typ: payload.typ,
      role: payload.role,
    };
  }

  /**
   * Issue a login OTP for a phone. The code is stored hashed and never logged.
   * In production it is delivered by SMS; for local dev/tests AUTH_OTP_DEV_ECHO
   * returns it in the response instead.
   */
  async requestOtp(
    phone: string,
    purpose: 'login' | 'recovery' = 'login',
  ): Promise<{ challengeId: string; devCode?: string }> {
    this.otpSender.assertOperational();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const challenge = await this.prisma.otpChallenge.create({
      data: { phone, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    try {
      await this.otpSender.send({ phone, code, purpose, expiresInSeconds: OTP_TTL_MS / 1000 });
    } catch (error) {
      await this.prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }
    // A bad production env must never turn OTP into an account-takeover API.
    const echo = this.config.get<string>('AUTH_OTP_DEV_ECHO') === 'true'
      && this.config.get<string>('NODE_ENV') !== 'production';
    return echo
      ? { challengeId: challenge.id, devCode: code }
      : { challengeId: challenge.id };
  }

  /** Issue an access-recovery OTP. Uses the same SMS channel without revealing account existence. */
  requestRecoveryOtp(phone: string): Promise<{ challengeId: string; devCode?: string }> {
    return this.requestOtp(phone, 'recovery');
  }

  /**
   * Issue a login OTP to an email. Email is a second channel into the same
   * account, not a second identity: phone stays the primary Customer key, so a
   * code is only ever delivered to an address already attached to an account.
   *
   * For an unknown address the call still returns a challenge id and still costs
   * the same time — otherwise the endpoint becomes an oracle for "does this
   * person shop here", which is exactly what an enumeration attack wants.
   */
  async requestEmailOtp(email: string): Promise<{ challengeId: string; devCode?: string }> {
    const normalized = normalizeEmail(email);
    const customer = await this.prisma.customer.findUnique({ where: { email: normalized } });
    if (!customer) {
      return { challengeId: randomBytes(16).toString('base64url') };
    }
    return this.issueEmailChallenge(normalized, 'login');
  }

  /**
   * Verify an email OTP and log the customer in. Unlike the phone path this never
   * creates an account: an address alone cannot become a customer, because every
   * order needs a phone for delivery and COD.
   */
  async verifyEmailOtp(email: string, code: string): Promise<AuthTokens> {
    const normalized = normalizeEmail(email);
    await this.consumeEmailOtp(normalized, code, 'login');
    const customer = await this.prisma.customer.findUnique({ where: { email: normalized } });
    if (!customer) {
      throw new ValidationError('customer_not_found', 'Аккаунт не найден');
    }
    return this.issueTokens(customer.id, customer.phone);
  }

  /**
   * Send a confirmation code to an address the signed-in customer wants to
   * attach. Nothing is written to the account here — possession of the mailbox
   * has to be proven first, otherwise anyone could park their login on someone
   * else's address.
   */
  async requestEmailAttach(
    customerId: string,
    email: string,
  ): Promise<{ challengeId: string; devCode?: string }> {
    const normalized = normalizeEmail(email);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new ValidationError('customer_not_found', 'Аккаунт не найден');
    }
    return this.issueEmailChallenge(normalized, 'email_attach');
  }

  /** Confirm the attach code and bind the address to the account. */
  async confirmEmailAttach(customerId: string, email: string, code: string): Promise<void> {
    const normalized = normalizeEmail(email);
    await this.consumeEmailOtp(normalized, code, 'email_attach');
    const owner = await this.prisma.customer.findUnique({ where: { email: normalized } });
    if (owner && owner.id !== customerId) {
      // Один адрес — один аккаунт: иначе вход по email стал бы неоднозначным.
      throw new ValidationError('email_taken', 'Этот адрес уже привязан к другому аккаунту');
    }
    try {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { email: normalized },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError('email_taken', 'Этот адрес уже привязан к другому аккаунту');
      }
      throw error;
    }
  }

  private async issueEmailChallenge(
    email: string,
    purpose: 'login' | 'email_attach',
  ): Promise<{ challengeId: string; devCode?: string }> {
    if (this.config.get<string>('NODE_ENV') === 'production' && this.emailOtpSender.name === 'noop') {
      throw new ValidationError('email_transport_unavailable', 'Email transport is not configured');
    }
    this.emailOtpSender.assertOperational();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        email,
        channel: 'email',
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    try {
      await this.emailOtpSender.send({
        email,
        code,
        purpose,
        expiresInSeconds: OTP_TTL_MS / 1000,
      });
    } catch (error) {
      await this.prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }
    const echo = this.config.get<string>('AUTH_OTP_DEV_ECHO') === 'true'
      && this.config.get<string>('NODE_ENV') !== 'production';
    return echo ? { challengeId: challenge.id, devCode: code } : { challengeId: challenge.id };
  }

  /**
   * Same attempt-capped, single-use consumption as the phone path, additionally
   * pinned to the purpose so an attach code cannot be replayed as a login code.
   */
  private async consumeEmailOtp(
    email: string,
    code: string,
    purpose: 'login' | 'email_attach',
  ): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        email,
        channel: 'email',
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new ValidationError('otp_not_found', 'Код не найден или истёк');
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new ValidationError('otp_locked', 'Слишком много попыток, запросите новый код');
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
      where: {
        phone,
        channel: 'sms',
        purpose: 'login',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
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
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "RefreshToken" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new ValidationError('refresh_invalid', 'Refresh-токен недействителен');
      }

      const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!record || record.expiresAt < new Date()) {
        throw new ValidationError('refresh_invalid', 'Refresh-токен недействителен');
      }
      if (record.revokedAt) {
        // The row lock serializes concurrent rotations. A replay only runs after the first
        // rotation committed, so it also revokes the replacement token created by that rotation.
        await tx.refreshToken.updateMany({
          where: { customerId: record.customerId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { kind: 'reused' as const };
      }
      await tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      const customer = await tx.customer.findUnique({
        where: { id: record.customerId },
      });
      if (!customer) {
        throw new ValidationError('customer_not_found', 'Клиент не найден');
      }
      return {
        kind: 'rotated' as const,
        tokens: await this.issueTokens(customer.id, customer.phone, tx),
      };
    });
    if (outcome.kind === 'reused') {
      throw new ValidationError(
        'refresh_reused',
        'Повторное использование токена — все сессии сброшены',
      );
    }
    return outcome.tokens;
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
    db: Pick<Prisma.TransactionClient, 'refreshToken'> = this.prisma,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: customerId, phone, typ: 'customer' },
      { expiresIn: ACCESS_TTL },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await db.refreshToken.create({
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

function normalizeEmail(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new ValidationError('email_invalid', 'Некорректный email');
  }
  return email;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

function socialPhone(provider: string, subject: string): string {
  const hex = createHash('sha256').update(`${provider}:${subject}`).digest('hex');
  const value = BigInt(`0x${hex.slice(0, 14)}`) % 10_000_000_000n;
  return `+999${value.toString().padStart(10, '0')}`;
}
