"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const argon2 = __importStar(require("argon2"));
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
const social_login_1 = require("./social-login");
const noop_otp_sender_1 = require("./noop-otp.sender");
const auth_methods_1 = require("./auth-methods");
const otp_sender_1 = require("./otp-sender");
const email_otp_sender_1 = require("./email-otp.sender");
const prisma_errors_1 = require("../common/prisma-errors");
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TTL = '15m';
const SOCIAL_ENROLLMENT_TTL_SECONDS = 10 * 60;
const SOCIAL_ASSERTION_RETENTION_SECONDS = 24 * 60 * 60;
const SOCIAL_ASSERTION_CLEANUP_BATCH_SIZE = 100;
const REVIEW_LOGIN_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_LOGIN_MAX_ATTEMPTS = 5;
const REVIEW_LOGIN_LOCK_MS = 15 * 60 * 1000;
const REVIEW_LOGIN_MAX_SUCCESSES = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function constantTimeEquals(actual, expected) {
    const left = Buffer.from(actual, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    if (left.length !== right.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(left, right);
}
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwt, config, otpSender = new noop_otp_sender_1.NoopOtpSender(), emailOtpSender = new email_otp_sender_1.NoopEmailOtpSender()) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
        this.otpSender = otpSender;
        this.emailOtpSender = emailOtpSender;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    onModuleInit() {
        if (this.config.get('AUTH_REVIEW_PHONE')?.trim()) {
            this.logger.warn('AUTH_REVIEW_PHONE is set — App Store review login is ACTIVE. Use a throwaway number and clear AUTH_REVIEW_PHONE/AUTH_REVIEW_OTP after review.');
        }
    }
    describeAuthMethods() {
        return (0, auth_methods_1.describeAuthMethods)((name) => this.config.get(name));
    }
    async verifyAccessToken(token) {
        const payload = await this.jwt.verifyAsync(token);
        if (!payload.sub || !['customer', 'staff'].includes(payload.typ)) {
            throw new errors_1.ValidationError('access_token_invalid', 'Недействительный access-токен');
        }
        return {
            customerId: payload.sub,
            phone: payload.phone,
            typ: payload.typ,
            role: payload.role,
        };
    }
    async requestOtp(rawPhone, purpose = 'login') {
        const phone = normalizePhone(rawPhone);
        const reviewLogin = purpose === 'login' && this.reviewOtpForPhone(phone) !== null;
        if (!reviewLogin)
            this.otpSender.assertOperational();
        if (reviewLogin) {
            await this.prisma.auditEvent.create({
                data: {
                    type: 'auth.review_login_challenge_issued',
                    actor: `auth:review:${this.hashToken(phone)}`,
                    refs: [],
                    payload: { outcome: 'challenge_issued' },
                },
            });
        }
        const code = String((0, node_crypto_1.randomInt)(0, 1_000_000)).padStart(6, '0');
        const codeHash = await argon2.hash(code);
        const challenge = await this.prisma.otpChallenge.create({
            data: {
                phone,
                purpose,
                codeHash,
                expiresAt: new Date(Date.now() + OTP_TTL_MS),
                ...(reviewLogin ? { consumedAt: new Date() } : {}),
            },
        });
        if (!reviewLogin) {
            try {
                await this.otpSender.send({ phone, code, purpose, expiresInSeconds: OTP_TTL_MS / 1000 });
            }
            catch (error) {
                await this.prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
                throw error;
            }
        }
        const echo = !reviewLogin
            && this.config.get('AUTH_OTP_DEV_ECHO') === 'true'
            && this.config.get('NODE_ENV') !== 'production';
        return echo
            ? { challengeId: challenge.id, devCode: code }
            : { challengeId: challenge.id };
    }
    requestRecoveryOtp(rawPhone) {
        this.assertRecoveryRolloutEnabled();
        return this.requestOtp(rawPhone, 'recovery');
    }
    async requestEmailOtp(email) {
        const normalized = normalizeEmail(email);
        if (this.config.get('NODE_ENV') === 'production'
            && this.config.get('AUTH_EMAIL_LOGIN_ENABLED') !== 'true') {
            throw new errors_1.ValidationError('email_login_temporarily_unavailable', 'Вход по email временно недоступен, используйте телефон');
        }
        this.emailOtpSender.assertOperational();
        const customer = await this.prisma.customer.findUnique({ where: { email: normalized } });
        return this.issueEmailChallenge(normalized, 'login', {
            deliver: customer !== null,
            genericDeliveryResponse: true,
        });
    }
    async verifyEmailOtp(email, code, challengeId) {
        const normalized = normalizeEmail(email);
        await this.consumeEmailOtp(normalized, code, 'login', challengeId);
        const customer = await this.prisma.customer.findUnique({ where: { email: normalized } });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', 'Аккаунт не найден');
        }
        return this.issueTokens(customer.id, customer.phone);
    }
    async requestEmailAttach(customerId, email) {
        const normalized = normalizeEmail(email);
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            throw new errors_1.ValidationError('customer_not_found', 'Аккаунт не найден');
        }
        return this.issueEmailChallenge(normalized, 'email_attach');
    }
    async confirmEmailAttach(customerId, email, code, challengeId) {
        const normalized = normalizeEmail(email);
        const challenge = await this.claimEmailOtp(normalized, code, 'email_attach', challengeId);
        try {
            await this.prisma.$transaction(async (tx) => {
                await this.consumeEmailClaim(challenge.id, tx);
                const owner = await tx.customer.findUnique({
                    where: { email: normalized },
                });
                if (owner && owner.id !== customerId) {
                    throw new errors_1.ValidationError('email_taken', 'Этот адрес уже привязан к другому аккаунту');
                }
                await tx.customer.update({
                    where: { id: customerId },
                    data: { email: normalized, emailVerifiedAt: new Date() },
                });
            });
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new errors_1.ValidationError('email_taken', 'Этот адрес уже привязан к другому аккаунту');
            }
            throw error;
        }
    }
    async issueEmailChallenge(email, purpose, options = { deliver: true }) {
        if (this.config.get('NODE_ENV') === 'production' && this.emailOtpSender.name === 'noop') {
            throw new errors_1.ValidationError('email_transport_unavailable', 'Email transport is not configured');
        }
        this.emailOtpSender.assertOperational();
        const code = String((0, node_crypto_1.randomInt)(0, 1_000_000)).padStart(6, '0');
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
            }
            catch (error) {
                if (!options.genericDeliveryResponse) {
                    await this.prisma.otpChallenge
                        .delete({ where: { id: challenge.id } })
                        .catch(() => undefined);
                    throw error;
                }
                this.logger.warn(`Email OTP delivery failed for challenge ${challenge.id}`, error instanceof Error ? error.stack : undefined);
            }
        }
        if (options.genericDeliveryResponse) {
            const configured = Number(this.config.get('EMAIL_OTP_RESPONSE_ENVELOPE_MS')
                ?? (this.config.get('NODE_ENV') === 'production' ? '3500' : '0'));
            const envelopeMs = Number.isFinite(configured)
                ? Math.max(0, Math.min(configured, 10_000))
                : 3_500;
            const remaining = envelopeMs - (Date.now() - deliveryStartedAt);
            if (remaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, remaining));
            }
        }
        const echo = options.deliver
            && delivered
            && this.config.get('AUTH_OTP_DEV_ECHO') === 'true'
            && this.config.get('NODE_ENV') !== 'production';
        return echo ? { challengeId: challenge.id, devCode: code } : { challengeId: challenge.id };
    }
    async consumeEmailOtp(email, code, purpose, challengeId) {
        const challenge = await this.claimEmailOtp(email, code, purpose, challengeId);
        await this.consumeEmailClaim(challenge.id, this.prisma);
    }
    async claimEmailOtp(email, code, purpose, challengeId) {
        const pinnedId = challengeId ?? null;
        const claimed = await this.prisma.$queryRaw `
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
                ? new errors_1.ValidationError('otp_locked', 'Слишком много попыток, запросите новый код')
                : new errors_1.ValidationError('otp_not_found', 'Код не найден или истёк');
        }
        const challenge = claimed[0];
        const ok = await argon2.verify(challenge.codeHash, code).catch(() => false);
        if (!ok) {
            throw new errors_1.ValidationError('otp_invalid', 'Неверный код');
        }
        return challenge;
    }
    async consumeEmailClaim(challengeId, db) {
        const consumed = await db.$executeRaw `
      UPDATE "OtpChallenge" SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${challengeId} AND "consumedAt" IS NULL
    `;
        if (consumed === 0) {
            throw new errors_1.ValidationError('otp_invalid', 'Код уже использован');
        }
    }
    async verifyOtp(rawPhone, code, challengeId) {
        const phone = normalizePhone(rawPhone);
        const reviewOtp = this.reviewOtpForPhone(phone);
        if (reviewOtp) {
            return this.authenticateReviewLogin(phone, code, reviewOtp);
        }
        const challenge = await this.claimPhoneOtp(phone, code, 'login', challengeId);
        return this.prisma.$transaction(async (tx) => {
            await this.consumeClaimOnTx(tx, challenge.id);
            const customer = await this.customerByCanonicalPhoneOnTx(tx, phone, true);
            return this.issueTokens(customer.id, customer.phone, tx);
        });
    }
    reviewOtpForPhone(phone) {
        const configuredPhone = this.config.get('AUTH_REVIEW_PHONE')?.trim();
        const reviewOtp = this.config.get('AUTH_REVIEW_OTP')?.trim();
        if (!configuredPhone || !reviewOtp)
            return null;
        let reviewPhone;
        try {
            reviewPhone = normalizePhone(configuredPhone);
        }
        catch {
            return null;
        }
        const until = this.config.get('AUTH_REVIEW_UNTIL')?.trim();
        if (!until)
            return null;
        const expiry = new Date(until).getTime();
        const remaining = expiry - Date.now();
        if (!Number.isFinite(expiry) || remaining <= 0 || remaining > REVIEW_LOGIN_MAX_WINDOW_MS) {
            return null;
        }
        return phone === reviewPhone ? reviewOtp : null;
    }
    async authenticateReviewLogin(phone, code, expectedCode) {
        const now = new Date();
        const actor = `auth:review:${this.hashToken(phone)}`;
        const outcome = await this.prisma.$transaction(async (tx) => {
            await tx.reviewLoginGuard.upsert({
                where: { phone },
                create: { phone },
                update: {},
            });
            await tx.$queryRaw `SELECT phone FROM "ReviewLoginGuard" WHERE phone = ${phone} FOR UPDATE`;
            let guard = await tx.reviewLoginGuard.findUniqueOrThrow({ where: { phone } });
            if (guard.disabledAt) {
                const customer = await tx.customer.findUnique({
                    where: { phone },
                    select: { id: true },
                });
                await this.auditReviewLogin(tx, actor, 'disabled', guard.attempts, null, customer?.id);
                return { kind: 'disabled' };
            }
            if (guard.lockedUntil && guard.lockedUntil > now) {
                await this.auditReviewLogin(tx, actor, 'locked', guard.attempts, guard.lockedUntil);
                return { kind: 'locked' };
            }
            if (guard.lockedUntil) {
                guard = await tx.reviewLoginGuard.update({
                    where: { phone },
                    data: { attempts: 0, lockedUntil: null },
                });
            }
            const customer = await tx.customer.findUnique({ where: { phone } });
            if (!constantTimeEquals(code, expectedCode) || !customer) {
                const attempts = guard.attempts + 1;
                const lockedUntil = attempts >= REVIEW_LOGIN_MAX_ATTEMPTS
                    ? new Date(now.getTime() + REVIEW_LOGIN_LOCK_MS)
                    : null;
                await tx.reviewLoginGuard.update({
                    where: { phone },
                    data: { attempts, lockedUntil, lastAttemptAt: now },
                });
                await this.auditReviewLogin(tx, actor, customer ? (lockedUntil ? 'locked' : 'invalid') : 'account_missing', attempts, lockedUntil);
                return { kind: lockedUntil ? 'locked' : 'invalid' };
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
            await this.auditReviewLogin(tx, actor, disabledAt ? 'success_disabled' : 'success', guard.attempts, null, customer.id);
            return {
                kind: 'authenticated',
                tokens: await this.issueTokens(customer.id, customer.phone, tx),
            };
        });
        if (outcome.kind === 'authenticated')
            return outcome.tokens;
        throw new errors_1.ValidationError(outcome.kind === 'locked' ? 'review_login_locked' : 'otp_invalid', 'Код не найден или истёк');
    }
    async auditReviewLogin(tx, actor, outcome, attempts, lockedUntil, customerId) {
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
    async verifyRecoveryOtp(rawPhone, code, challengeId) {
        this.assertRecoveryRolloutEnabled();
        const phone = normalizePhone(rawPhone);
        const challenge = await this.claimPhoneOtp(phone, code, 'recovery', challengeId);
        return this.prisma.$transaction(async (tx) => {
            await this.consumeClaimOnTx(tx, challenge.id);
            const customer = await this.customerByCanonicalPhoneOnTx(tx, phone, false);
            if (!customer) {
                throw new errors_1.ValidationError('customer_not_found', 'Аккаунт не найден');
            }
            await tx.refreshToken.updateMany({
                where: { customerId: customer.id, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            return this.issueTokens(customer.id, customer.phone, tx);
        });
    }
    async loginWithTelegram(dto) {
        const profile = this.verifyTelegramProfile(dto, false);
        const customer = await this.existingCustomerForSocialProfile(profile);
        if (!customer) {
            throw new errors_1.ValidationError('social_enrollment_required', 'Обновите приложение и подтвердите номер телефона для входа');
        }
        await this.reserveConsumedSocialAssertion(profile, profile.replayIdentity);
        return this.issueTokens(customer.id, customer.phone);
    }
    async loginWithTelegramV2(dto) {
        const profile = this.verifyTelegramProfile(dto, true);
        return this.resolveSocialV2(profile, profile.replayIdentity);
    }
    verifyTelegramProfile(dto, enrollment) {
        const botToken = this.config.get('TELEGRAM_BOT_TOKEN');
        if (!botToken) {
            throw new errors_1.ValidationError('social_provider_not_configured', 'Telegram login is not configured');
        }
        const maxAge = Number(enrollment
            ? this.config.get('TELEGRAM_ENROLLMENT_MAX_AGE_SECONDS')
                ?? SOCIAL_ENROLLMENT_TTL_SECONDS
            : this.config.get('TELEGRAM_AUTH_MAX_AGE_SECONDS') ?? 24 * 60 * 60);
        return (0, social_login_1.verifyTelegramLogin)({
            initData: dto.initData,
            source: dto.source,
            maxAgeSeconds: Number.isFinite(maxAge) ? maxAge : undefined,
        }, botToken);
    }
    async loginWithApple(dto) {
        if (!dto.nonce?.trim()) {
            throw new errors_1.ValidationError('apple_nonce_required', 'Apple nonce is required');
        }
        const profile = await this.verifyAppleProfile(dto);
        const customer = await this.existingCustomerForSocialProfile(profile);
        if (!customer) {
            throw new errors_1.ValidationError('social_enrollment_required', 'Обновите приложение и подтвердите номер телефона для входа');
        }
        await this.reserveConsumedSocialAssertion(profile, dto.identityToken);
        return this.issueTokens(customer.id, customer.phone);
    }
    async loginWithAppleV2(dto) {
        if (!dto.nonce?.trim()) {
            throw new errors_1.ValidationError('apple_nonce_required', 'Apple nonce is required');
        }
        const profile = await this.verifyAppleProfile(dto);
        return this.resolveSocialV2(profile, dto.identityToken);
    }
    async loginWithGoogleV2(dto) {
        const clientId = this.config.get('GOOGLE_CLIENT_ID');
        if (!clientId) {
            throw new errors_1.ValidationError('social_provider_not_configured', 'Google login is not configured');
        }
        if (!dto.nonce?.trim()) {
            throw new errors_1.ValidationError('google_nonce_required', 'Google nonce is required');
        }
        const profile = await (0, social_login_1.verifyGoogleIdentityToken)({
            identityToken: dto.identityToken,
            clientId,
            nonce: dto.nonce,
        });
        return this.resolveSocialV2(profile, dto.identityToken);
    }
    async verifyAppleProfile(dto) {
        const clientId = this.config.get('APPLE_CLIENT_ID');
        if (!clientId) {
            throw new errors_1.ValidationError('social_provider_not_configured', 'Apple login is not configured');
        }
        return (0, social_login_1.verifyAppleIdentityToken)({
            identityToken: dto.identityToken,
            clientId,
            nonce: dto.nonce,
            name: dto.name,
            jwksUrl: this.config.get('APPLE_JWKS_URL'),
        });
    }
    async resolveSocialV2(profile, providerAssertion) {
        const customer = await this.existingCustomerForSocialProfile(profile);
        if (customer) {
            await this.reserveConsumedSocialAssertion(profile, providerAssertion);
            return {
                status: 'authenticated',
                ...(await this.issueTokens(customer.id, customer.phone)),
            };
        }
        const expiresIn = this.socialEnrollmentTtlSeconds();
        const enrollmentToken = (0, node_crypto_1.randomBytes)(32).toString('base64url');
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
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new errors_1.ValidationError('social_auth_replayed', 'Эта авторизация провайдера уже использована');
            }
            throw error;
        }
        return { status: 'enrollment_required', enrollmentToken, expiresIn };
    }
    async completeSocialEnrollment(dto) {
        const phone = normalizePhone(dto.phone);
        const legacyPhone = phone.slice(1);
        const tokenHash = this.hashToken(dto.enrollmentToken);
        try {
            const outcome = await this.prisma.$transaction(async (tx) => {
                const rows = await tx.$queryRaw `
          SELECT id, provider, subject, email, "displayName", "avatarUrl",
                 "expiresAt", "consumedAt"
          FROM "SocialEnrollment"
          WHERE "tokenHash" = ${tokenHash}
          FOR UPDATE
        `;
                const enrollment = rows[0];
                if (!enrollment
                    || enrollment.consumedAt
                    || enrollment.expiresAt <= new Date()) {
                    throw new errors_1.ValidationError('social_enrollment_invalid', 'Enrollment token недействителен, истёк или уже использован');
                }
                const pinnedId = dto.challengeId ?? null;
                const claimed = await tx.$queryRaw `
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
                    throw new errors_1.ValidationError('otp_not_found', 'Код не найден, истёк или уже использован');
                }
                const validCode = await argon2
                    .verify(claimed[0].codeHash, dto.code)
                    .catch(() => false);
                if (!validCode) {
                    return { kind: 'otp_invalid' };
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
                    throw new errors_1.ValidationError('social_identity_already_linked', 'Провайдер уже привязан к аккаунту');
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
                    throw new errors_1.ValidationError('social_enrollment_invalid', 'Enrollment или код уже использован');
                }
                return {
                    kind: 'authenticated',
                    result: {
                        status: 'authenticated',
                        ...(await this.issueTokens(customer.id, customer.phone, tx)),
                    },
                };
            });
            if (outcome.kind === 'otp_invalid') {
                throw new errors_1.ValidationError('otp_invalid', 'Неверный код');
            }
            return outcome.result;
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new errors_1.ValidationError('social_identity_already_linked', 'Провайдер уже привязан к аккаунту');
            }
            throw error;
        }
    }
    socialEnrollmentTtlSeconds() {
        const configured = Number(this.config.get('SOCIAL_ENROLLMENT_TTL_SECONDS')
            ?? SOCIAL_ENROLLMENT_TTL_SECONDS);
        return Number.isFinite(configured)
            ? Math.max(60, Math.min(900, Math.floor(configured)))
            : SOCIAL_ENROLLMENT_TTL_SECONDS;
    }
    async reserveConsumedSocialAssertion(profile, providerAssertion) {
        const now = new Date();
        await this.deleteExpiredSocialAssertions(now);
        const internalMarker = (0, node_crypto_1.randomBytes)(32).toString('base64url');
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
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                throw new errors_1.ValidationError('social_auth_replayed', 'Эта авторизация провайдера уже использована');
            }
            throw error;
        }
    }
    async deleteExpiredSocialAssertions(now = new Date()) {
        const cleanupBeforeUtc = now.toISOString();
        await this.prisma.$executeRaw `
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
    assertRecoveryRolloutEnabled() {
        const configured = this.config.get('AUTH_RECOVERY_OTP_ENABLED')?.trim();
        const production = this.config.get('NODE_ENV') === 'production';
        if (configured === 'true' || (!production && configured !== 'false'))
            return;
        throw new errors_1.ValidationError('recovery_temporarily_unavailable', 'Восстановление временно недоступно, используйте обычный вход по SMS');
    }
    async claimPhoneOtp(phone, code, purpose, challengeId) {
        const pinnedId = challengeId ?? null;
        const legacyPhone = phone.slice(1);
        const claimed = await this.prisma.$queryRaw `
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
                ? new errors_1.ValidationError('otp_locked', 'Слишком много попыток, запросите новый код')
                : new errors_1.ValidationError('otp_not_found', 'Код не найден или истёк');
        }
        const challenge = claimed[0];
        const ok = await argon2.verify(challenge.codeHash, code).catch(() => false);
        if (!ok) {
            throw new errors_1.ValidationError('otp_invalid', 'Неверный код');
        }
        return challenge;
    }
    async consumeClaimOnTx(tx, challengeId) {
        const consumed = await tx.$executeRaw `
      UPDATE "OtpChallenge" SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE id = ${challengeId} AND "consumedAt" IS NULL
    `;
        if (consumed === 0) {
            throw new errors_1.ValidationError('otp_invalid', 'Код уже использован');
        }
    }
    async customerByCanonicalPhoneOnTx(tx, phone, createIfMissing) {
        const canonical = await tx.customer.findUnique({ where: { phone } });
        if (canonical)
            return canonical;
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
    async refresh(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        const graceEnabled = this.refreshRotationGraceEnabled();
        const outcome = await this.prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw `
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
                throw new errors_1.ValidationError('refresh_invalid', 'Refresh-токен недействителен');
            }
            const record = locked[0];
            const now = new Date();
            if (record.expiresAt < now) {
                throw new errors_1.ValidationError('refresh_invalid', 'Refresh-токен недействителен');
            }
            if (record.revokedAt) {
                if (graceEnabled && record.withinRotationGrace) {
                    const customer = await tx.customer.findUnique({
                        where: { id: record.customerId },
                    });
                    if (!customer) {
                        throw new errors_1.ValidationError('customer_not_found', 'Клиент не найден');
                    }
                    const tokens = await this.issueDerivedRefreshTokens(customer.id, customer.phone, refreshToken, tx);
                    if (tokens)
                        return { kind: 'rotated', tokens };
                    await tx.refreshToken.updateMany({
                        where: { customerId: record.customerId, revokedAt: null },
                        data: { revokedAt: now },
                    });
                    return { kind: 'reused' };
                }
                await tx.refreshToken.updateMany({
                    where: { customerId: record.customerId, revokedAt: null },
                    data: { revokedAt: now },
                });
                return { kind: 'reused' };
            }
            await tx.$executeRaw `
        UPDATE "RefreshToken"
        SET "revokedAt" = (NOW() AT TIME ZONE 'UTC'),
            "rotatedAt" = (NOW() AT TIME ZONE 'UTC')
        WHERE id = ${record.id}
      `;
            const customer = await tx.customer.findUnique({
                where: { id: record.customerId },
            });
            if (!customer) {
                throw new errors_1.ValidationError('customer_not_found', 'Клиент не найден');
            }
            return {
                kind: 'rotated',
                tokens: graceEnabled
                    ? await this.issueDerivedRefreshTokens(customer.id, customer.phone, refreshToken, tx).then((tokens) => {
                        if (!tokens) {
                            throw new errors_1.ValidationError('refresh_reused', 'Refresh-сессия отозвана');
                        }
                        return tokens;
                    })
                    : await this.issueTokens(customer.id, customer.phone, tx),
            };
        });
        if (outcome.kind === 'reused') {
            throw new errors_1.ValidationError('refresh_reused', 'Повторное использование токена — все сессии сброшены');
        }
        return outcome.tokens;
    }
    async logout(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        await this.prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw `
        SELECT id, "customerId", "revokedAt"
        FROM "RefreshToken"
        WHERE "tokenHash" = ${tokenHash}
        FOR UPDATE
      `;
            const record = locked[0];
            if (!record)
                return;
            if (record.revokedAt) {
                await tx.$executeRaw `
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
    async existingCustomerForSocialProfile(profile) {
        const existing = await this.prisma.customerIdentity.findUnique({
            where: {
                provider_subject: {
                    provider: profile.provider,
                    subject: profile.subject,
                },
            },
            include: { customer: true },
        });
        if (!existing)
            return null;
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
    async issueTokens(customerId, phone, db = this.prisma) {
        const accessToken = await this.jwt.signAsync({ sub: customerId, phone, typ: 'customer' }, { expiresIn: ACCESS_TTL });
        const refreshToken = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        await db.refreshToken.create({
            data: {
                customerId,
                tokenHash: this.hashToken(refreshToken),
                expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
            },
        });
        return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL };
    }
    async issueDerivedRefreshTokens(customerId, phone, parentRefreshToken, db) {
        const secret = this.config.get('AUTH_REFRESH_DERIVATION_SECRET')?.trim();
        if (!secret || secret.length < 32) {
            throw new Error('AUTH_REFRESH_DERIVATION_SECRET must be at least 32 characters when refresh rotation grace is enabled');
        }
        const refreshToken = (0, node_crypto_1.createHmac)('sha256', secret)
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
        if (record.customerId !== customerId || record.revokedAt)
            return null;
        const accessToken = await this.jwt.signAsync({ sub: customerId, phone, typ: 'customer' }, { expiresIn: ACCESS_TTL });
        return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL };
    }
    refreshRotationGraceEnabled() {
        return this.config.get('AUTH_REFRESH_ROTATION_GRACE_ENABLED')
            ?.trim()
            .toLowerCase() === 'true';
    }
    hashToken(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(otp_sender_1.OTP_SENDER)),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)(email_otp_sender_1.EMAIL_OTP_SENDER)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService, Object, Object])
], AuthService);
function normalizeEmail(rawEmail) {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        throw new errors_1.ValidationError('email_invalid', 'Некорректный email');
    }
    return email;
}
function normalizePhone(rawPhone) {
    const phone = rawPhone.trim();
    if (!/^\+?[1-9]\d{8,14}$/.test(phone)) {
        throw new errors_1.ValidationError('phone_invalid', 'Некорректный номер телефона');
    }
    return phone.startsWith('+') ? phone : `+${phone}`;
}
function isUniqueViolation(error) {
    return (0, prisma_errors_1.isUniqueConstraintViolation)(error);
}
//# sourceMappingURL=auth.service.js.map