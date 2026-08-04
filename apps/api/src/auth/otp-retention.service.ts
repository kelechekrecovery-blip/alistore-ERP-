import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Периодически стирает отработавшие OTP-challenge.
 *
 * `OtpChallenge.phone` — телефон открытым текстом, и до этой службы его не удалял
 * никто: `deleteAccount` чистит только номер своего клиента, а подавляющая часть
 * строк аккаунтом так и не становится (ошиблись цифрой, бросили экран кода,
 * перебирали чужой номер). Номера копились бессрочно — политика обещала обратное.
 *
 * Удалять безопасно: после `expiresAt` challenge не читает никто, `verifyOtp`
 * отвергает просроченный по сроку, а не по наличию строки.
 */
const SWEEP_INTERVAL_MS = 60 * 60_000;
/**
 * Сколько challenge живёт сверх собственного срока. Ноль был бы корректен
 * функционально, но окно оставлено на разбор злоупотреблений: перебор номера
 * виден только по следам попыток. Сутки — компромисс между этим и обещанием
 * не хранить телефоны дольше необходимого.
 */
const GRACE_MS = 24 * 60 * 60_000;

@Injectable()
export class OtpRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OtpRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeExpired(now = new Date()): Promise<{ purged: number }> {
    const cutoff = new Date(now.getTime() - GRACE_MS);
    const { count } = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return { purged: count };
  }

  /** Фоновый проход: сбой уборки не должен ронять приложение или вход. */
  private async sweep(): Promise<void> {
    try {
      const { purged } = await this.purgeExpired();
      if (purged > 0) this.logger.log(`Стёрто просроченных OTP-challenge: ${purged}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown otp retention error';
      this.logger.warn(`Уборка OTP-challenge не прошла: ${message}`);
    }
  }
}
