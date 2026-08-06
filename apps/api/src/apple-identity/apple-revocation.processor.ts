import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppleOAuthClient, AppleOAuthError } from './apple-oauth.client';
import { AppleTokenCrypto } from './apple-token.crypto';
import { randomUUID } from 'node:crypto';

const BATCH_SIZE = 20;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

@Injectable()
export class AppleRevocationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppleRevocationProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.PROCESS_ROLE !== 'worker'
      || this.config.get<string>('APPLE_REVOCATION_RELAY_ENABLED') !== 'true'
    ) return;
    const configured = Number(this.config.get<string>('APPLE_REVOCATION_POLL_MS'));
    const intervalMs = Number.isFinite(configured) && configured >= 5_000
      ? configured
      : 30_000;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch {
      this.logger.error('Apple revocation batch failed; the next scheduled tick will retry');
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processBatch(): Promise<number> {
    const now = new Date();
    await this.sweepExpiredEnrollments(now);
    await this.prisma.appleRevocationJob.updateMany({
      where: {
        status: 'processing',
        updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) },
      },
      data: { status: 'pending', claimToken: null, nextAttemptAt: now },
    });
    // Configuration errors are parked long enough for an operator alert/fix,
    // then automatically retried so corrected credentials recover unattended.
    await this.prisma.appleRevocationJob.updateMany({
      where: {
        status: 'configuration_error',
        updatedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) },
      },
      data: { status: 'pending', claimToken: null, nextAttemptAt: now },
    });
    const candidates = await this.prisma.appleRevocationJob.findMany({
      where: {
        status: 'pending',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { updatedAt: 'asc' },
      take: BATCH_SIZE,
    });
    if (candidates.length === 0) return 0;

    let oauth: AppleOAuthClient;
    let crypto: AppleTokenCrypto;
    try {
      oauth = new AppleOAuthClient(this.config);
      crypto = new AppleTokenCrypto(this.config);
    } catch {
      await this.prisma.appleRevocationJob.updateMany({
        where: { id: { in: candidates.map((grant) => grant.id) }, status: 'pending' },
        data: { status: 'configuration_error', lastErrorCode: 'apple_oauth_config_invalid' },
      });
      this.logger.error('Apple revocation configuration is invalid; grants were parked');
      return 0;
    }

    let processed = 0;
    for (const grant of candidates) {
      const claimToken = randomUUID();
      const claimed = await this.prisma.appleRevocationJob.updateMany({
        where: { id: grant.id, status: 'pending' },
        data: { status: 'processing', claimToken, nextAttemptAt: null },
      });
      if (claimed.count !== 1) continue;
      try {
        const refreshToken = crypto.decrypt(
          grant.refreshTokenEnvelope,
          `${grant.clientId}:${grant.subject}`,
        );
        await oauth.revokeRefreshToken({ refreshToken, clientId: grant.clientId });
        const deleted = await this.prisma.appleRevocationJob.deleteMany({
          where: { id: grant.id, status: 'processing', claimToken },
        });
        processed += deleted.count;
      } catch (error) {
        if (error instanceof AppleOAuthError && error.reason === 'invalid_grant') {
          const deleted = await this.prisma.appleRevocationJob.deleteMany({
            where: { id: grant.id, status: 'processing', claimToken },
          });
          processed += deleted.count;
          continue;
        }
        const attempts = grant.attempts + 1;
        const configurationError = error instanceof AppleOAuthError
          && error.reason === 'invalid_client';
        await this.prisma.appleRevocationJob.updateMany({
          where: { id: grant.id, status: 'processing', claimToken },
          data: configurationError
            ? {
                status: 'configuration_error',
                claimToken: null,
                attempts,
                lastErrorCode: 'apple_invalid_client',
              }
            : {
                status: 'pending',
                claimToken: null,
                attempts,
                nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
                lastErrorCode: error instanceof AppleOAuthError
                  ? error.code
                  : 'apple_token_crypto_invalid',
              },
        });
      }
    }
    return processed;
  }

  private async sweepExpiredEnrollments(now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const expired = await tx.$queryRaw<Array<{
        id: string;
        subject: string;
        appleClientId: string;
        appleGrantId: string;
      }>>`
        SELECT id, subject, "appleClientId", "appleGrantId"
        FROM "SocialEnrollment"
        WHERE provider = 'apple'
          AND "consumedAt" IS NULL
          AND "expiresAt" < ${now}
          AND "appleClientId" IS NOT NULL
          AND "appleGrantId" IS NOT NULL
        ORDER BY "expiresAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      for (const enrollment of expired) {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${'apple-grant:' + enrollment.appleClientId + ':' + enrollment.subject}))::text AS locked
        `;
        const grant = await tx.appleOAuthGrant.findUnique({
          where: { id: enrollment.appleGrantId },
        });
        if (grant?.status === 'enrollment') {
          await tx.appleRevocationJob.create({
            data: {
              subject: grant.subject,
              clientId: grant.clientId,
              refreshTokenEnvelope: grant.refreshTokenEnvelope,
            },
          });
          await tx.appleOAuthGrant.delete({ where: { id: grant.id } });
        }
        await tx.socialEnrollment.delete({ where: { id: enrollment.id } });
      }
    });
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(24 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts - 1, 11));
}
