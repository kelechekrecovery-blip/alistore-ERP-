import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import {
  AppleSocialLoginDto,
  CompleteSocialEnrollmentDto,
  TelegramSocialLoginDto,
} from './auth.dto';
import {
  SocialProfile,
  VerifiedTelegramProfile,
  verifyAppleIdentityToken,
  verifyTelegramLogin,
} from './social-login';
import { NoopOtpSender } from './noop-otp.sender';
import { describeAuthMethods, type AuthMethodsView } from './auth-methods';
import { OTP_SENDER, OtpSender } from './otp-sender';
import {
  EMAIL_OTP_SENDER,
  EmailOtpSender,
  NoopEmailOtpSender,
} from './email-otp.sender';
import type { AuthPrincipal, JwtPayload } from './jwt.strategy';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { normalizePhone } from './phone-normalization';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export type SocialAuthResult =
  | ({ status: 'authenticated' } & AuthTokens)
  | {
      status: 'enrollment_required';
      enrollmentToken: string;
      expiresIn: number;
    };

const OTP_TTL_MS = 5 * 60 * 1000; // 5 минут
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const ACCESS_TTL = '15m';
const SOCIAL_ENROLLMENT_TTL_SECONDS = 10 * 60;
const SOCIAL_ASSERTION_RETENTION_SECONDS = 24 * 60 * 60;
const SOCIAL_ASSERTION_CLEANUP_BATCH_SIZE = 100;
const REVIEW_LOGIN_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_LOGIN_MAX_ATTEMPTS = 5;
const REVIEW_LOGIN_LOCK_MS = 15 * 60 * 1000;
const REVIEW_LOGIN_MAX_SUCCESSES = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type PhoneOtpPurpose = 'login' | 'recovery';
type ClaimedOtp = { id: string; codeHash: string };

/**
 * Сравнение без утечки по времени.
 *
 * Обычный `!==` выходит на первом различающемся символе. Для кода ревьюера это
 * единственное место, где секрет сверяется в открытую (у обычных OTP сравнение
 * прячет argon2), поэтому здесь уместна та же дисциплина, что уже применяется к
 * подписи Telegram в `social-login.ts`. Длины сверяются отдельно: `timingSafeEqual`
 * бросает на разных размерах буферов.
 */
function constantTimeEquals(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Customer authentication by phone + OTP (Roadmap MVP: «вход по телефону+OTP»).
 * Access is a short-lived JWT; the refresh token is opaque, stored only as a
 * sha-256 hash and rotated (single-use) on every refresh so a leaked token can be
 * used at most once. Login is not a money/stock/status mutation, so it writes no
 * Event Ledger entry — the ledger stays reserved for those (see AuditService).
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender = new NoopOtpSender(),
    @Optional()
    @Inject(EMAIL_OTP_SENDER)
    private readonly emailOtpSender: EmailOtpSender = new NoopEmailOtpSender(),
  ) {}

  /**
   * The App Store review login is a deliberate, fixed-code entry into one account.
   * If it is configured at boot, shout — so it can never be left on silently past
   * a review window.
   */
  onModuleInit(): void {
    const values = {
      phone: this.config.get<string>('AUTH_REVIEW_PHONE')?.trim(),
      otp: this.config.get<string>('AUTH_REVIEW_OTP')?.trim(),
      customerId: this.config.get<string>('AUTH_REVIEW_CUSTOMER_ID')?.trim(),
      until: this.config.get<string>('AUTH_REVIEW_UNTIL')?.trim(),
    };
    if (!Object.values(values).some(Boolean)) return;
    let validPhone = false;
    try {
      validPhone = Boolean(values.phone && normalizePhone(values.phone));
    } catch {
      validPhone = false;
    }
    const expiry = new Date(values.until ?? '').getTime();
    const remaining = expiry - Date.now();
    const validWindow = Number.isFinite(expiry)
      && remaining > 0
      && remaining <= REVIEW_LOGIN_MAX_WINDOW_MS;
    const fullyConfigured = validPhone
      && /^\d{6}$/u.test(values.otp ?? '')
      && Boolean(values.customerId)
      && validWindow;
    if (fullyConfigured) {
      this.logger.warn(
        'AUTH_REVIEW_PHONE is set — App Store review login is ACTIVE. Clear every AUTH_REVIEW_* value after review.',
      );
      return;
    }
    this.logger.error(
      'App Store review login is MISCONFIGURED and INACTIVE. Set a valid AUTH_REVIEW_PHONE, six-digit AUTH_REVIEW_OTP, AUTH_REVIEW_CUSTOMER_ID and short future AUTH_REVIEW_UNTIL together.',
    );
  }

  /**
   * Какие входы действительно работают в этом процессе.
   *
   * Клиенты обязаны спрашивать здесь, а не выводить ответ из собственных
   * сборочных флагов: витрина собирается заранее и о содержимом дашборда Render
   * ничего не знает.
   */
  describeAuthMethods(): AuthMethodsView {
    return describeAuthMethods((name) => this.config.get<string>(name));
  }

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
    rawPhone: string,
    purpose: PhoneOtpPurpose = 'login',
  ): Promise<{ challengeId: string; devCode?: string }> {
    const phone = normalizePhone(rawPhone);
    /**
     * Вход ревьюера сторов начинается здесь, а не в `verifyOtp`.
     *
     * Механизм фиксированного кода жил только в проверке, но добраться до него
     * было нельзя: `assertOperational` ниже отказывает при `SMS_PROVIDER=disabled`,
     * то есть до создания вызова, а клиенты (iOS и витрина) показывают поле кода
     * лишь после успешного запроса. Ревьюеру физически некуда было ввести
     * согласованный код — это и есть отказ App Store 2.1(a).
     *
     * Обход не расширяет обычный вход: `reviewOtpForPhone` требует все четыре
     * переменные, точное совпадение номера и непросроченное окно не длиннее
     * семи дней, а `purpose` ограничен логином — восстановление доступа отзывает
     * чужие сессии и этим ключом не открывается. Любой другой номер по-прежнему
     * получает честный отказ SMS-канала.
     */
    const reviewLogin = purpose === 'login' && this.reviewOtpForPhone(phone) !== null;
    if (!reviewLogin) this.otpSender.assertOperational();
    if (reviewLogin) {
      // Обход канала — событие безопасности. Успех и провал самого входа уже
      // пишутся (`auth.review_login_*`), но факт «для этого номера выпущен вызов
      // в обход отключённого SMS» не оставлял следа, и восстановить постфактум,
      // когда и сколько раз обходом пользовались, было нельзя. Номер здесь
      // одновременно персональные данные и секрет обхода, поэтому в леджер идёт
      // тот же хеш, которым помечается актор входа ревьюера.
      await this.prisma.auditEvent.create({
        data: {
          type: 'auth.review_login_challenge_issued',
          actor: `auth:review:${this.hashToken(phone)}`,
          refs: [],
          payload: { outcome: 'challenge_issued' },
        },
      });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        phone,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        /**
         * Вызов обхода рождается уже погашенным — и это не косметика.
         *
         * `verifyOtp` для согласованного номера идёт своей веткой и challenge не
         * трогает, но он не единственный, кто такие строки ищет.
         * `completeSocialEnrollment` берёт непогашенный `sms`/`login` вызов по
         * тому же номеру и на верном коде зовёт
         * `customerByCanonicalPhoneOnTx(..., true)` — то есть создаёт покупателя
         * и привязывает к нему `CustomerIdentity`. Обычная claimable строка
         * означала бы, что посторонний, знающий номер ревьюера, перебирает
         * шестизначный код (5 попыток на вызов, вызовы — по 3 в минуту) и в
         * случае удачи привязывает СВОЙ Apple-аккаунт к этому номеру, сохраняя
         * доступ после того, как окно ревью закрыто и переменные стёрты.
         *
         * До обхода такой строки не существовало ни для одного номера:
         * `assertOperational` резал запрос раньше. Погашенный вызов возвращает
         * это свойство — он нужен лишь для формы ответа, которую ждут клиенты,
         * и не годится ни одному потребителю, требующему `consumedAt IS NULL`.
         */
        ...(reviewLogin ? { consumedAt: new Date() } : {}),
      },
    });
    if (!reviewLogin) {
      try {
        await this.otpSender.send({ phone, code, purpose, expiresInSeconds: OTP_TTL_MS / 1000 });
      } catch (error) {
        await this.prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
        throw error;
      }
    }
    // A bad production env must never turn OTP into an account-takeover API.
    //
    // Для согласованного номера эхо подавлено и вне production: сгенерированный
    // код там бесполезен — `verifyOtp` уходит в ветку ревью и сверяет
    // фиксированное значение. Отдать его значило бы выдать тестировщику
    // заведомо неработающий код и потратить его время на «код не подходит» при
    // технически валидном коде.
    const echo = !reviewLogin
      && this.config.get<string>('AUTH_OTP_DEV_ECHO') === 'true'
      && this.config.get<string>('NODE_ENV') !== 'production';
    return echo
      ? { challengeId: challenge.id, devCode: code }
      : { challengeId: challenge.id };
  }

  /** Issue an access-recovery OTP. Uses the same SMS channel without revealing account existence. */
  requestRecoveryOtp(rawPhone: string): Promise<{ challengeId: string; devCode?: string }> {
    this.assertRecoveryRolloutEnabled();
    return this.requestOtp(rawPhone, 'recovery');
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
    if (
      this.config.get<string>('NODE_ENV') === 'production'
      && this.config.get<string>('AUTH_EMAIL_LOGIN_ENABLED') !== 'true'
    ) {
      throw new ValidationError(
        'email_login_temporarily_unavailable',
        'Вход по email временно недоступен, используйте телефон',
      );
    }
    // Guard стоит до поиска клиента: раньше неизвестный адрес возвращался раньше
    // него, и на проде со сломанным SMTP неизвестные адреса получали 200, а
    // известные — email_transport_unavailable. Это тоже был ответ на вопрос
    // «есть ли здесь аккаунт».
    this.emailOtpSender.assertOperational();
    const customer = await this.prisma.customer.findUnique({ where: { email: normalized } });
    // Вызов создаётся всегда — и для неизвестного адреса тоже. Прежняя ветка
    // возвращала `randomBytes(16).toString('base64url')`: 22 символа из
    // [A-Za-z0-9_-] против 25-символьного cuid из базы. Одного запроса хватало,
    // чтобы по длине ответа отличить клиента от не-клиента; статистика по
    // времени была уже не нужна. Теперь обе ветки делают одинаковую работу —
    // argon2 и запись строки — и различаются только тем, уходит ли письмо.
    return this.issueEmailChallenge(normalized, 'login', {
      deliver: customer !== null,
      genericDeliveryResponse: true,
    });
  }

  /**
   * Verify an email OTP and log the customer in. Unlike the phone path this never
   * creates an account: an address alone cannot become a customer, because every
   * order needs a phone for delivery and COD.
   */
  async verifyEmailOtp(email: string, code: string, challengeId?: string): Promise<AuthTokens> {
    const normalized = normalizeEmail(email);
    await this.consumeEmailOtp(normalized, code, 'login', challengeId);
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
  async confirmEmailAttach(
    customerId: string,
    email: string,
    code: string,
    challengeId?: string,
  ): Promise<void> {
    const normalized = normalizeEmail(email);
    // Claiming (including a failed attempt increment) commits independently.
    // A valid claim is only consumed inside the attach transaction below.
    const challenge = await this.claimEmailOtp(
      normalized,
      code,
      'email_attach',
      challengeId,
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.consumeEmailClaim(challenge.id, tx);
        const owner = await tx.customer.findUnique({
          where: { email: normalized },
        });
        if (owner && owner.id !== customerId) {
          // Один адрес — один аккаунт: иначе вход по email стал бы неоднозначным.
          throw new ValidationError(
            'email_taken',
            'Этот адрес уже привязан к другому аккаунту',
          );
        }
        await tx.customer.update({
          where: { id: customerId },
          // Challenge consumption and the verified email write commit together:
          // a transient/unique failure cannot burn a valid attach proof.
          data: { email: normalized, emailVerifiedAt: new Date() },
        });
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
    options: { deliver: boolean; genericDeliveryResponse?: boolean } = { deliver: true },
  ): Promise<{ challengeId: string; devCode?: string }> {
    if (this.config.get<string>('NODE_ENV') === 'production' && this.emailOtpSender.name === 'noop') {
      throw new ValidationError('email_transport_unavailable', 'Email transport is not configured');
    }
    this.emailOtpSender.assertOperational();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // argon2 считается и для недоставляемого вызова: это самая дорогая операция
    // в запросе, и пропустить её значило бы вернуть таймингу ту же роль оракула,
    // которую только что отняли у формы идентификатора.
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
    const deliveryStartedAt = Date.now();
    let delivered = !options.deliver;
    if (options.deliver) {
      try {
        await this.emailOtpSender.send({
          email,
          code,
          purpose,
          expiresInSeconds: OTP_TTL_MS / 1000,
        });
        delivered = true;
      } catch (error) {
        if (!options.genericDeliveryResponse) {
          await this.prisma.otpChallenge
            .delete({ where: { id: challenge.id } })
            .catch(() => undefined);
          throw error;
        }
        this.logger.warn(
          `Email OTP delivery failed for challenge ${challenge.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    if (options.genericDeliveryResponse) {
      // SMTP is awaited, then known and unknown responses share one lower
      // bound. No response is acknowledged while delivery is still pending.
      const configured = Number(
        this.config.get<string>('EMAIL_OTP_RESPONSE_ENVELOPE_MS')
          ?? (this.config.get<string>('NODE_ENV') === 'production' ? '3500' : '0'),
      );
      const envelopeMs = Number.isFinite(configured)
        ? Math.max(0, Math.min(configured, 10_000))
        : 3_500;
      const remaining = envelopeMs - (Date.now() - deliveryStartedAt);
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
    }
    // Код возвращается только если письмо действительно ушло: иначе dev-эхо
    // выдавало бы код на чужой адрес — ровно то перечисление, от которого
    // защищаемся, и притом в готовом виде.
    const echo = options.deliver
      && delivered
      && this.config.get<string>('AUTH_OTP_DEV_ECHO') === 'true'
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
    challengeId?: string,
  ): Promise<void> {
    const challenge = await this.claimEmailOtp(
      email,
      code,
      purpose,
      challengeId,
    );
    await this.consumeEmailClaim(challenge.id, this.prisma);
  }

  private async claimEmailOtp(
    email: string,
    code: string,
    purpose: 'login' | 'email_attach',
    challengeId?: string,
  ): Promise<ClaimedOtp> {
    const pinnedId = challengeId ?? null;
    // Попытка занимается ОДНИМ запросом. Прежняя версия читала строку, сверяла
    // `attempts >= 5` по этому снимку, считала argon2 и только потом писала
    // increment — тремя отдельными запросами без блокировки. Десять параллельных
    // проверок все видели attempts = 0 и все проходили лимит: бюджет перебора
    // был не пять, а сколько пропустит throttle. Здесь строка блокируется самим
    // UPDATE, и условие `attempts < 5` перепроверяется уже под блокировкой.
    const claimed = await this.prisma.$queryRaw<ClaimedOtp[]>`
      UPDATE "OtpChallenge" SET attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "OtpChallenge"
        WHERE email = ${email}
          AND channel::text = 'email'
          AND purpose::text = ${purpose}
          AND (${pinnedId}::text IS NULL OR id = ${pinnedId})
          AND "consumedAt" IS NULL
          -- expiresAt это timestamp БЕЗ зоны, и в нём лежит UTC; NOW() это
          -- timestamptz. При сравнении PostgreSQL приводит колонку через пояс
          -- сессии (здесь Asia/Bishkek), и 13:11 UTC превращается в 07:11 --
          -- условие ложно всегда, любой код "не найден". Сравниваем в UTC.
          AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
        ORDER BY "createdAt" DESC
        LIMIT 1
      )
      AND attempts < ${OTP_MAX_ATTEMPTS}
      RETURNING id, "codeHash"
    `;

    if (claimed.length === 0) {
      // Ноль строк — либо вызова нет, либо попытки исчерпаны. Различаем ради
      // сообщения, а не ради решения: обе ветки одинаково отказывают.
      const exhausted = await this.prisma.otpChallenge.findFirst({
        where: {
          ...(challengeId ? { id: challengeId } : {}),
          email,
          channel: 'email',
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      throw exhausted
        ? new ValidationError('otp_locked', 'Слишком много попыток, запросите новый код')
        : new ValidationError('otp_not_found', 'Код не найден или истёк');
    }

    const challenge = claimed[0];
    const ok = await argon2.verify(challenge.codeHash, code).catch(() => false);
    if (!ok) {
      throw new ValidationError('otp_invalid', 'Неверный код');
    }
    return challenge;
  }

  private async consumeEmailClaim(
    challengeId: string,
    db: Pick<Prisma.TransactionClient, '$executeRaw'>,
  ): Promise<void> {
    // Одноразовость тоже была декларацией: два параллельных запроса с верным
    // кодом оба видели consumedAt = null и оба выдавали токены. Условие в WHERE
    // делает победителя ровно одним.
    const consumed = await db.$executeRaw`
      UPDATE "OtpChallenge" SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${challengeId} AND "consumedAt" IS NULL
    `;
    if (consumed === 0) {
      throw new ValidationError('otp_invalid', 'Код уже использован');
    }
  }

  /**
   * Verify an OTP and log the customer in (find-or-create by phone). Wrong codes
   * increment an attempt counter and lock the challenge after OTP_MAX_ATTEMPTS; a
   * consumed or expired challenge cannot be reused.
   */
  async verifyOtp(rawPhone: string, code: string, challengeId?: string): Promise<AuthTokens> {
    const phone = normalizePhone(rawPhone);
    // App Store / Play review login: the reviewer cannot receive an SMS, so one
    // pre-agreed phone accepts one fixed code — only when both env vars are set,
    // and only for an exact phone+code match. Any other phone, any other code, or
    // a missing env var falls through to the normal challenge check below.
    const reviewLogin = this.reviewOtpForPhone(phone);
    if (reviewLogin) {
      return this.authenticateReviewLogin(phone, code, reviewLogin.code, reviewLogin.customerId);
    }

    const challenge = await this.claimPhoneOtp(phone, code, 'login', challengeId);
    return this.prisma.$transaction(async (tx) => {
      await this.consumeClaimOnTx(tx, challenge.id);
      const customer = await this.customerByCanonicalPhoneOnTx(tx, phone, true);
      return this.issueTokens(customer.id, customer.phone, tx);
    });
  }

  /**
   * True only when a review account is configured with an exact phone, OTP and
   * immutable customer id. A random phone collision can therefore never turn a
   * real customer into the review account.
   */
  private reviewOtpForPhone(phone: string): { code: string; customerId: string } | null {
    const configuredPhone = this.config.get<string>('AUTH_REVIEW_PHONE')?.trim();
    const reviewOtp = this.config.get<string>('AUTH_REVIEW_OTP')?.trim();
    const customerId = this.config.get<string>('AUTH_REVIEW_CUSTOMER_ID')?.trim();
    if (!configuredPhone || !reviewOtp || !/^\d{6}$/u.test(reviewOtp) || !customerId) return null;
    let reviewPhone: string;
    try {
      reviewPhone = normalizePhone(configuredPhone);
    } catch {
      return null;
    }
    // Expiry is mandatory and capped: review credentials must not become a
    // permanent customer-login bypass if deployment configuration is forgotten.
    const until = this.config.get<string>('AUTH_REVIEW_UNTIL')?.trim();
    if (!until) return null;
    const expiry = new Date(until).getTime();
    const remaining = expiry - Date.now();
    if (!Number.isFinite(expiry) || remaining <= 0 || remaining > REVIEW_LOGIN_MAX_WINDOW_MS) {
      return null;
    }
    return phone === reviewPhone ? { code: reviewOtp, customerId } : null;
  }

  private async authenticateReviewLogin(
    phone: string,
    code: string,
    expectedCode: string,
    expectedCustomerId: string,
  ): Promise<AuthTokens> {
    const now = new Date();
    const actor = `auth:review:${this.hashToken(phone)}`;
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.reviewLoginGuard.upsert({
        where: { phone },
        create: { phone },
        update: {},
      });
      await tx.$queryRaw`SELECT phone FROM "ReviewLoginGuard" WHERE phone = ${phone} FOR UPDATE`;
      let guard = await tx.reviewLoginGuard.findUniqueOrThrow({ where: { phone } });

      if (guard.disabledAt) {
        const customer = await tx.customer.findUnique({
          where: { phone },
          select: { id: true },
        });
        await this.auditReviewLogin(
          tx,
          actor,
          'disabled',
          guard.attempts,
          null,
          customer?.id,
        );
        return { kind: 'disabled' as const };
      }
      if (guard.lockedUntil && guard.lockedUntil > now) {
        await this.auditReviewLogin(
          tx,
          actor,
          'locked',
          guard.attempts,
          guard.lockedUntil,
        );
        return { kind: 'locked' as const };
      }
      if (guard.lockedUntil) {
        guard = await tx.reviewLoginGuard.update({
          where: { phone },
          data: { attempts: 0, lockedUntil: null },
        });
      }

      const customer = await tx.customer.findUnique({ where: { phone } });
      const correctAccount = customer?.id === expectedCustomerId;
      if (!constantTimeEquals(code, expectedCode) || !correctAccount) {
        const attempts = guard.attempts + 1;
        const lockedUntil = attempts >= REVIEW_LOGIN_MAX_ATTEMPTS
          ? new Date(now.getTime() + REVIEW_LOGIN_LOCK_MS)
          : null;
        await tx.reviewLoginGuard.update({
          where: { phone },
          data: { attempts, lockedUntil, lastAttemptAt: now },
        });
        await this.auditReviewLogin(
          tx,
          actor,
          correctAccount ? (lockedUntil ? 'locked' : 'invalid') : 'account_missing',
          attempts,
          lockedUntil,
        );
        return { kind: lockedUntil ? 'locked' as const : 'invalid' as const };
      }

      const successes = guard.successes + 1;
      const disabledAt = successes >= REVIEW_LOGIN_MAX_SUCCESSES ? now : null;
      await tx.reviewLoginGuard.update({
        where: { phone },
        data: {
          attempts: 0,
          successes,
          lockedUntil: null,
          disabledAt,
          lastAttemptAt: now,
        },
      });
      await this.auditReviewLogin(
        tx,
        actor,
        disabledAt ? 'success_disabled' : 'success',
        guard.attempts,
        null,
        customer.id,
      );
      return {
        kind: 'authenticated' as const,
        tokens: await this.issueTokens(customer.id, customer.phone, tx),
      };
    });

    if (outcome.kind === 'authenticated') return outcome.tokens;
    throw new ValidationError(
      outcome.kind === 'locked' ? 'review_login_locked' : 'otp_invalid',
      'Код не найден или истёк',
    );
  }

  private async auditReviewLogin(
    tx: Prisma.TransactionClient,
    actor: string,
    outcome: 'invalid' | 'locked' | 'disabled' | 'account_missing' | 'success' | 'success_disabled',
    attempts: number,
    lockedUntil: Date | null,
    customerId?: string,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        type: `auth.review_login_${outcome}`,
        actor,
        refs: customerId ? [customerId] : [],
        payload: {
          outcome,
          attempts,
          ...(lockedUntil ? { lockedUntil: lockedUntil.toISOString() } : {}),
        },
      },
    });
  }

  /**
   * Verify a recovery OTP for an existing account, revoke all old refresh tokens,
   * then issue a fresh pair. This is the safe "lost phone/session" path.
   */
  async verifyRecoveryOtp(
    rawPhone: string,
    code: string,
    challengeId?: string,
  ): Promise<AuthTokens> {
    this.assertRecoveryRolloutEnabled();
    const phone = normalizePhone(rawPhone);
    const challenge = await this.claimPhoneOtp(phone, code, 'recovery', challengeId);
    return this.prisma.$transaction(async (tx) => {
      await this.consumeClaimOnTx(tx, challenge.id);
      const customer = await this.customerByCanonicalPhoneOnTx(tx, phone, false);
      if (!customer) {
        throw new ValidationError('customer_not_found', 'Аккаунт не найден');
      }
      await tx.refreshToken.updateMany({
        where: { customerId: customer.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return this.issueTokens(customer.id, customer.phone, tx);
    });
  }

  async loginWithTelegram(dto: TelegramSocialLoginDto): Promise<AuthTokens> {
    const profile = this.verifyTelegramProfile(dto, false);
    const customer = await this.existingCustomerForSocialProfile(profile);
    if (!customer) {
      throw new ValidationError(
        'social_enrollment_required',
        'Обновите приложение и подтвердите номер телефона для входа',
      );
    }
    await this.reserveConsumedSocialAssertion(profile, profile.replayIdentity);
    return this.issueTokens(customer.id, customer.phone);
  }

  async loginWithTelegramV2(dto: TelegramSocialLoginDto): Promise<SocialAuthResult> {
    const profile = this.verifyTelegramProfile(dto, true);
    return this.resolveSocialV2(profile, profile.replayIdentity);
  }

  private verifyTelegramProfile(
    dto: TelegramSocialLoginDto,
    enrollment: boolean,
  ): VerifiedTelegramProfile {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new ValidationError(
        'social_provider_not_configured',
        'Telegram login is not configured',
      );
    }
    const maxAge = Number(enrollment
      ? this.config.get<string>('TELEGRAM_ENROLLMENT_MAX_AGE_SECONDS')
        ?? SOCIAL_ENROLLMENT_TTL_SECONDS
      : this.config.get<string>('TELEGRAM_AUTH_MAX_AGE_SECONDS') ?? 24 * 60 * 60);
    return verifyTelegramLogin(
      {
        initData: dto.initData,
        source: dto.source,
        maxAgeSeconds: Number.isFinite(maxAge) ? maxAge : undefined,
      },
      botToken,
    );
  }

  async loginWithApple(dto: AppleSocialLoginDto): Promise<AuthTokens> {
    if (!dto.nonce?.trim()) {
      throw new ValidationError('apple_nonce_required', 'Apple nonce is required');
    }
    const profile = await this.verifyAppleProfile(dto);
    const customer = await this.existingCustomerForSocialProfile(profile);
    if (!customer) {
      throw new ValidationError(
        'social_enrollment_required',
        'Обновите приложение и подтвердите номер телефона для входа',
      );
    }
    await this.reserveConsumedSocialAssertion(profile, dto.identityToken);
    return this.issueTokens(customer.id, customer.phone);
  }

  async loginWithAppleV2(dto: AppleSocialLoginDto): Promise<SocialAuthResult> {
    if (!dto.nonce?.trim()) {
      throw new ValidationError('apple_nonce_required', 'Apple nonce is required');
    }
    const profile = await this.verifyAppleProfile(dto);
    return this.resolveSocialV2(profile, dto.identityToken);
  }

  private async verifyAppleProfile(dto: AppleSocialLoginDto): Promise<SocialProfile> {
    const clientId = this.config.get<string>('APPLE_CLIENT_ID');
    if (!clientId) {
      throw new ValidationError(
        'social_provider_not_configured',
        'Apple login is not configured',
      );
    }
    return verifyAppleIdentityToken({
      identityToken: dto.identityToken,
      clientId,
      nonce: dto.nonce,
      name: dto.name,
      jwksUrl: this.config.get<string>('APPLE_JWKS_URL'),
    });
  }

  private async resolveSocialV2(
    profile: SocialProfile,
    providerAssertion: string,
  ): Promise<SocialAuthResult> {
    const customer = await this.existingCustomerForSocialProfile(profile);
    if (customer) {
      await this.reserveConsumedSocialAssertion(profile, providerAssertion);
      return {
        status: 'authenticated',
        ...(await this.issueTokens(customer.id, customer.phone)),
      };
    }

    const expiresIn = this.socialEnrollmentTtlSeconds();
    const enrollmentToken = randomBytes(32).toString('base64url');
    try {
      await this.deleteExpiredSocialAssertions();
      await this.prisma.socialEnrollment.create({
        data: {
          tokenHash: this.hashToken(enrollmentToken),
          assertionHash: this.hashToken(providerAssertion),
          provider: profile.provider,
          subject: profile.subject,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError(
          'social_auth_replayed',
          'Эта авторизация провайдера уже использована',
        );
      }
      throw error;
    }
    return { status: 'enrollment_required', enrollmentToken, expiresIn };
  }

  async completeSocialEnrollment(
    dto: CompleteSocialEnrollmentDto,
  ): Promise<{ status: 'authenticated' } & AuthTokens> {
    const phone = normalizePhone(dto.phone);
    const legacyPhone = phone.slice(1);
    const tokenHash = this.hashToken(dto.enrollmentToken);

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{
          id: string;
          provider: string;
          subject: string;
          email: string | null;
          displayName: string | null;
          avatarUrl: string | null;
          expiresAt: Date;
          consumedAt: Date | null;
        }>>`
          SELECT id, provider, subject, email, "displayName", "avatarUrl",
                 "expiresAt", "consumedAt"
          FROM "SocialEnrollment"
          WHERE "tokenHash" = ${tokenHash}
          FOR UPDATE
        `;
        const enrollment = rows[0];
        if (
          !enrollment
          || enrollment.consumedAt
          || enrollment.expiresAt <= new Date()
        ) {
          throw new ValidationError(
            'social_enrollment_invalid',
            'Enrollment token недействителен, истёк или уже использован',
          );
        }

        const pinnedId = dto.challengeId ?? null;
        const claimed = await tx.$queryRaw<ClaimedOtp[]>`
          UPDATE "OtpChallenge" SET attempts = attempts + 1
          WHERE id = (
            SELECT id FROM "OtpChallenge"
            WHERE phone IN (${phone}, ${legacyPhone})
              AND channel::text = 'sms'
              AND purpose::text = 'login'
              AND (${pinnedId}::text IS NULL OR id = ${pinnedId})
              AND "consumedAt" IS NULL
              AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
            ORDER BY "createdAt" DESC
            LIMIT 1
            FOR UPDATE
          )
          AND attempts < ${OTP_MAX_ATTEMPTS}
          RETURNING id, "codeHash"
        `;
        if (claimed.length === 0) {
          throw new ValidationError(
            'otp_not_found',
            'Код не найден, истёк или уже использован',
          );
        }
        const validCode = await argon2
          .verify(claimed[0].codeHash, dto.code)
          .catch(() => false);
        if (!validCode) {
          // Return (rather than throw) so the attempt increment commits. The
          // caller converts this closed outcome into the public error afterward.
          return { kind: 'otp_invalid' as const };
        }

        const alreadyLinked = await tx.customerIdentity.findUnique({
          where: {
            provider_subject: {
              provider: enrollment.provider,
              subject: enrollment.subject,
            },
          },
        });
        if (alreadyLinked) {
          throw new ValidationError(
            'social_identity_already_linked',
            'Провайдер уже привязан к аккаунту',
          );
        }

        const customer = await this.customerByCanonicalPhoneOnTx(tx, phone, true);
        await tx.customerIdentity.create({
          data: {
            customerId: customer.id,
            provider: enrollment.provider,
            subject: enrollment.subject,
            email: enrollment.email,
            displayName: enrollment.displayName,
            avatarUrl: enrollment.avatarUrl,
          },
        });
        if (!customer.name && enrollment.displayName) {
          await tx.customer.update({
            where: { id: customer.id },
            data: { name: enrollment.displayName },
          });
        }

        const consumedEnrollment = await tx.socialEnrollment.updateMany({
          where: { id: enrollment.id, consumedAt: null },
          // Keep the assertion fingerprint after the short enrollment ticket
          // expires. Cleanup uses expiresAt, so extending it here preserves the
          // replay marker for the provider freshness/retention window.
          data: {
            consumedAt: new Date(),
            expiresAt: new Date(Date.now() + SOCIAL_ASSERTION_RETENTION_SECONDS * 1000),
          },
        });
        const consumedChallenge = await tx.otpChallenge.updateMany({
          where: { id: claimed[0].id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumedEnrollment.count !== 1 || consumedChallenge.count !== 1) {
          throw new ValidationError(
            'social_enrollment_invalid',
            'Enrollment или код уже использован',
          );
        }
        return {
          kind: 'authenticated' as const,
          result: {
            status: 'authenticated' as const,
            ...(await this.issueTokens(customer.id, customer.phone, tx)),
          },
        };
      });
      if (outcome.kind === 'otp_invalid') {
        throw new ValidationError('otp_invalid', 'Неверный код');
      }
      return outcome.result;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError(
          'social_identity_already_linked',
          'Провайдер уже привязан к аккаунту',
        );
      }
      throw error;
    }
  }

  private socialEnrollmentTtlSeconds(): number {
    const configured = Number(
      this.config.get<string>('SOCIAL_ENROLLMENT_TTL_SECONDS')
      ?? SOCIAL_ENROLLMENT_TTL_SECONDS,
    );
    return Number.isFinite(configured)
      ? Math.max(60, Math.min(900, Math.floor(configured)))
      : SOCIAL_ENROLLMENT_TTL_SECONDS;
  }

  /**
   * Reserve every verified provider assertion, including the fast path for an
   * already-linked identity. This makes an intercepted Apple token or Telegram
   * initData single-use instead of replayable for the provider freshness window.
   * Consumed rows use an internal random marker that is never returned to a
   * client, while the raw provider assertion is stored only as a SHA-256 hash.
   */
  private async reserveConsumedSocialAssertion(
    profile: SocialProfile,
    providerAssertion: string,
  ): Promise<void> {
    const now = new Date();
    await this.deleteExpiredSocialAssertions(now);
    const internalMarker = randomBytes(32).toString('base64url');
    try {
      await this.prisma.socialEnrollment.create({
        data: {
          tokenHash: this.hashToken(internalMarker),
          assertionHash: this.hashToken(providerAssertion),
          provider: profile.provider,
          subject: profile.subject,
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          expiresAt: new Date(now.getTime() + SOCIAL_ASSERTION_RETENTION_SECONDS * 1000),
          consumedAt: now,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ValidationError(
          'social_auth_replayed',
          'Эта авторизация провайдера уже использована',
        );
      }
      throw error;
    }
  }

  private async deleteExpiredSocialAssertions(now = new Date()): Promise<void> {
    const cleanupBeforeUtc = now.toISOString();
    // Select and delete in one statement. Under PostgreSQL READ COMMITTED, if
    // completion concurrently extends an expired enrollment while DELETE waits
    // for its row lock, the final expiresAt predicate is rechecked against the
    // updated row and preserves the fresh anti-replay marker.
    await this.prisma.$executeRaw`
      DELETE FROM "SocialEnrollment"
      WHERE id IN (
        SELECT id
        FROM "SocialEnrollment"
        WHERE "expiresAt" < CAST(${cleanupBeforeUtc} AS TIMESTAMP)
        ORDER BY "expiresAt" ASC
        LIMIT ${SOCIAL_ASSERTION_CLEANUP_BATCH_SIZE}
      )
      AND "expiresAt" < CAST(${cleanupBeforeUtc} AS TIMESTAMP)
    `;
  }

  /**
   * Recovery purpose uses an expand/switch rollout. Production keeps it
   * disabled while old API instances drain after the additive enum migration;
   * only then may operators enable AUTH_RECOVERY_OTP_ENABLED=true.
   */
  private assertRecoveryRolloutEnabled(): void {
    const configured = this.config.get<string>('AUTH_RECOVERY_OTP_ENABLED')?.trim();
    const production = this.config.get<string>('NODE_ENV') === 'production';
    if (configured === 'true' || (!production && configured !== 'false')) return;
    throw new ValidationError(
      'recovery_temporarily_unavailable',
      'Восстановление временно недоступно, используйте обычный вход по SMS',
    );
  }

  private async claimPhoneOtp(
    phone: string,
    code: string,
    purpose: PhoneOtpPurpose,
    challengeId?: string,
  ): Promise<ClaimedOtp> {
    const pinnedId = challengeId ?? null;
    const legacyPhone = phone.slice(1);
    // UPDATE is the claim. PostgreSQL re-checks attempts < max after waiting on
    // the row lock, so parallel guesses can claim at most OTP_MAX_ATTEMPTS.
    const claimed = await this.prisma.$queryRaw<ClaimedOtp[]>`
      UPDATE "OtpChallenge" SET attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "OtpChallenge"
        WHERE phone IN (${phone}, ${legacyPhone})
          AND channel::text = 'sms'
          AND purpose::text = ${purpose}
          AND (${pinnedId}::text IS NULL OR id = ${pinnedId})
          AND "consumedAt" IS NULL
          AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
        ORDER BY "createdAt" DESC
        LIMIT 1
      )
      AND attempts < ${OTP_MAX_ATTEMPTS}
      RETURNING id, "codeHash"
    `;

    if (claimed.length === 0) {
      const candidate = await this.prisma.otpChallenge.findFirst({
        where: {
          ...(challengeId ? { id: challengeId } : {}),
          phone: { in: [phone, legacyPhone] },
          channel: 'sms',
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
      throw candidate && candidate.attempts >= OTP_MAX_ATTEMPTS
        ? new ValidationError('otp_locked', 'Слишком много попыток, запросите новый код')
        : new ValidationError('otp_not_found', 'Код не найден или истёк');
    }

    const challenge = claimed[0];
    const ok = await argon2.verify(challenge.codeHash, code).catch(() => false);
    if (!ok) {
      throw new ValidationError('otp_invalid', 'Неверный код');
    }
    return challenge;
  }

  private async consumeClaimOnTx(tx: Prisma.TransactionClient, challengeId: string): Promise<void> {
    const consumed = await tx.$executeRaw`
      UPDATE "OtpChallenge" SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${challengeId} AND "consumedAt" IS NULL
    `;
    if (consumed === 0) {
      throw new ValidationError('otp_invalid', 'Код уже использован');
    }
  }

  /**
   * Migration normally removes the historical no-plus form. Keeping this
   * adoption path preserves the original customer id and all relations if a
   * legacy row survived an earlier deployment.
   */
  private async customerByCanonicalPhoneOnTx(
    tx: Prisma.TransactionClient,
    phone: string,
    createIfMissing: true,
  ): Promise<Customer>;
  private async customerByCanonicalPhoneOnTx(
    tx: Prisma.TransactionClient,
    phone: string,
    createIfMissing: false,
  ): Promise<Customer | null>;
  private async customerByCanonicalPhoneOnTx(
    tx: Prisma.TransactionClient,
    phone: string,
    createIfMissing: boolean,
  ): Promise<Customer | null> {
    const canonical = await tx.customer.findUnique({ where: { phone } });
    if (canonical) return canonical;

    const legacy = await tx.customer.findUnique({ where: { phone: phone.slice(1) } });
    if (legacy) {
      return tx.customer.update({
        where: { id: legacy.id },
        data: { phone },
      });
    }

    return createIfMissing
      ? tx.customer.create({ data: { phone, name: '' } })
      : null;
  }

  /** Rotate a refresh token: the presented token is revoked and a new pair issued. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const graceEnabled = this.refreshRotationGraceEnabled();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string;
        customerId: string;
        expiresAt: Date;
        revokedAt: Date | null;
        rotatedAt: Date | null;
        withinRotationGrace: boolean;
      }>>`
        SELECT id, "customerId", "expiresAt", "revokedAt", "rotatedAt",
               (
                 "rotatedAt" IS NOT NULL
                 AND "rotatedAt" >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 seconds'
               ) AS "withinRotationGrace"
        FROM "RefreshToken"
        WHERE "tokenHash" = ${tokenHash}
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new ValidationError('refresh_invalid', 'Refresh-токен недействителен');
      }

      const record = locked[0];
      const now = new Date();
      if (record.expiresAt < now) {
        throw new ValidationError('refresh_invalid', 'Refresh-токен недействителен');
      }
      if (record.revokedAt) {
        if (graceEnabled && record.withinRotationGrace) {
          const customer = await tx.customer.findUnique({
            where: { id: record.customerId },
          });
          if (!customer) {
            throw new ValidationError('customer_not_found', 'Клиент не найден');
          }
          const tokens = await this.issueDerivedRefreshTokens(
            customer.id,
            customer.phone,
            refreshToken,
            tx,
          );
          if (tokens) return { kind: 'rotated' as const, tokens };
          await tx.refreshToken.updateMany({
            where: { customerId: record.customerId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'reused' as const };
        }
        // Outside the narrow concurrency window, replay retains the existing
        // fail-closed behavior and revokes every live customer session.
        await tx.refreshToken.updateMany({
          where: { customerId: record.customerId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'reused' as const };
      }
      await tx.$executeRaw`
        UPDATE "RefreshToken"
        SET "revokedAt" = (NOW() AT TIME ZONE 'UTC'),
            "rotatedAt" = (NOW() AT TIME ZONE 'UTC')
        WHERE id = ${record.id}
      `;
      const customer = await tx.customer.findUnique({
        where: { id: record.customerId },
      });
      if (!customer) {
        throw new ValidationError('customer_not_found', 'Клиент не найден');
      }
      return {
        kind: 'rotated' as const,
        tokens: graceEnabled
          ? await this.issueDerivedRefreshTokens(
              customer.id,
              customer.phone,
              refreshToken,
              tx,
            ).then((tokens) => {
              if (!tokens) {
                throw new ValidationError('refresh_reused', 'Refresh-сессия отозвана');
              }
              return tokens;
            })
          : await this.issueTokens(customer.id, customer.phone, tx),
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
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: string;
        customerId: string;
        revokedAt: Date | null;
      }>>`
        SELECT id, "customerId", "revokedAt"
        FROM "RefreshToken"
        WHERE "tokenHash" = ${tokenHash}
        FOR UPDATE
      `;
      const record = locked[0];
      if (!record) return;
      if (record.revokedAt) {
        // A concurrent refresh may already have rotated the cookie presented
        // by logout. Revoke its live children so a late Set-Cookie response
        // cannot resurrect the session on reload.
        await tx.$executeRaw`
          UPDATE "RefreshToken"
          SET "rotatedAt" = NULL
          WHERE id = ${record.id}
        `;
        await tx.refreshToken.updateMany({
          where: { customerId: record.customerId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return;
      }
      await tx.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async existingCustomerForSocialProfile(
    profile: SocialProfile,
  ): Promise<Customer | null> {
    const existing = await this.prisma.customerIdentity.findUnique({
      where: {
        provider_subject: {
          provider: profile.provider,
          subject: profile.subject,
        },
      },
      include: { customer: true },
    });
    if (!existing) return null;
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

  private async issueDerivedRefreshTokens(
    customerId: string,
    phone: string,
    parentRefreshToken: string,
    db: Pick<Prisma.TransactionClient, 'refreshToken'>,
  ): Promise<AuthTokens | null> {
    const secret = this.config.get<string>('AUTH_REFRESH_DERIVATION_SECRET')?.trim();
    if (!secret || secret.length < 32) {
      throw new Error(
        'AUTH_REFRESH_DERIVATION_SECRET must be at least 32 characters when refresh rotation grace is enabled',
      );
    }
    const refreshToken = createHmac('sha256', secret)
      .update('alistore-refresh-child-v1\0')
      .update(parentRefreshToken)
      .digest('base64url');
    const tokenHash = this.hashToken(refreshToken);
    const record = await db.refreshToken.upsert({
      where: { tokenHash },
      create: {
        customerId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
      update: {},
    });
    if (record.customerId !== customerId || record.revokedAt) return null;
    const accessToken = await this.jwt.signAsync(
      { sub: customerId, phone, typ: 'customer' },
      { expiresIn: ACCESS_TTL },
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL };
  }

  private refreshRotationGraceEnabled(): boolean {
    return this.config.get<string>('AUTH_REFRESH_ROTATION_GRACE_ENABLED')
      ?.trim()
      .toLowerCase() === 'true';
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
  return isUniqueConstraintViolation(error);
}
