import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CriticalAlert {
  /** Stable source tag, e.g. 'api', 'refund-relay', 'outbox-relay'. */
  source: string;
  /** Stable human message — used for dedup, so keep it free of per-occurrence ids. */
  message: string;
  error?: unknown;
}

export interface AlertRecord {
  at: string;
  source: string;
  message: string;
  delivered: boolean;
}

const DEFAULT_DEDUP_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_PER_WINDOW = 10;
const RECENT_LIMIT = 50;
const TEXT_LIMIT = 900;

/**
 * Critical-alert channel (Telegram ops chat) for unhandled API errors and
 * worker tick failures. A safe no-op until ALERT_TELEGRAM_BOT_TOKEN and
 * ALERT_TELEGRAM_CHAT_ID are set, so dev/tests never phone home. Delivery is
 * fire-and-forget and never throws into the request/worker path; repeating
 * alerts are deduplicated and globally rate-capped so an outage cannot spam
 * the ops chat. Recent alerts are kept in memory for the status dashboard.
 */
@Injectable()
export class AlerterService {
  private readonly logger = new Logger(AlerterService.name);
  readonly enabled: boolean;

  private readonly apiUrl: string;
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly environment: string;
  private readonly dedupWindowMs: number;
  private readonly maxPerWindow: number;

  private readonly lastSentAtByKey = new Map<string, number>();
  private readonly sentAtWindow: number[] = [];
  private readonly recent: AlertRecord[] = [];
  private suppressed = 0;

  constructor(config: ConfigService) {
    this.apiUrl = (
      config.get<string>('ALERT_TELEGRAM_API_URL') ?? 'https://api.telegram.org'
    ).replace(/\/$/, '');
    this.botToken = config.get<string>('ALERT_TELEGRAM_BOT_TOKEN') ?? '';
    this.chatId = config.get<string>('ALERT_TELEGRAM_CHAT_ID') ?? '';
    this.environment = config.get<string>('NODE_ENV') ?? 'development';
    this.dedupWindowMs = this.positiveInt(
      config.get<string>('ALERT_DEDUP_WINDOW_MS'),
      DEFAULT_DEDUP_WINDOW_MS,
    );
    this.maxPerWindow = this.positiveInt(
      config.get<string>('ALERT_MAX_PER_WINDOW'),
      DEFAULT_MAX_PER_WINDOW,
    );
    this.enabled = Boolean(this.botToken && this.chatId);
    if (this.enabled) {
      this.logger.log('Telegram alert channel enabled');
    }
  }

  /**
   * Queue a critical alert. Synchronous signature: delivery happens in the
   * background and failures are logged, never thrown. When the channel is not
   * configured the alert is still recorded (delivered=false) for the dashboard.
   */
  notifyCritical(alert: CriticalAlert): void {
    const message = this.stableMessage(alert.message);
    const now = Date.now();

    if (this.isDuplicate(alert.source, message, now) || this.isRateCapped(now)) {
      this.suppressed += 1;
      return;
    }

    this.remember(alert.source, message, this.enabled, now);
    if (!this.enabled) return;

    void this.deliver(alert.source, message, alert.error).catch((err) => {
      this.logger.warn(
        `Alert delivery failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    });
  }

  /**
   * То же самое, но с ожиданием доставки — для короткоживущих процессов.
   *
   * `notifyCritical` намеренно fire-and-forget: в запросе и в тике worker'а
   * нельзя ждать Telegram. Но крон бэкапа живёт секунды и завершается сразу
   * после ошибки, поэтому незавершённый `void deliver()` умирает вместе с
   * процессом — то есть единственный сигнал о провале бэкапа терялся бы именно
   * в тот момент, когда он нужен. Здесь ждём и глотаем ошибку доставки: она не
   * должна подменять собой исходную причину падения.
   */
  async notifyCriticalAndWait(alert: CriticalAlert): Promise<void> {
    const message = this.stableMessage(alert.message);
    this.remember(alert.source, message, this.enabled, Date.now());
    if (!this.enabled) return;
    try {
      await this.deliver(alert.source, message, alert.error);
    } catch (err) {
      this.logger.warn(
        `Alert delivery failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  /** Newest first, for the protected status dashboard. */
  recentAlerts(limit = 20): AlertRecord[] {
    return this.recent.slice(0, Math.max(0, limit));
  }

  /** Count of alerts dropped by dedup/rate-limit since process start. */
  get suppressedCount(): number {
    return this.suppressed;
  }

  private async deliver(source: string, message: string, error?: unknown): Promise<void> {
    const detail = error instanceof Error ? error.message : undefined;
    const text = [`🚨 [AliStore ${this.environment}] ${source}: ${message}`];
    if (detail && detail !== message) text.push(detail.slice(0, 300));

    const response = await fetch(`${this.apiUrl}/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: text.join('\n').slice(0, TEXT_LIMIT),
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`.trim());
    }
  }

  private isDuplicate(source: string, message: string, now: number): boolean {
    const key = `${source}|${message}`;
    const last = this.lastSentAtByKey.get(key);
    if (last !== undefined && now - last < this.dedupWindowMs) return true;
    this.lastSentAtByKey.set(key, now);
    // Bound the map: drop entries outside the window.
    if (this.lastSentAtByKey.size > 500) {
      for (const [k, at] of this.lastSentAtByKey) {
        if (now - at >= this.dedupWindowMs) this.lastSentAtByKey.delete(k);
      }
    }
    return false;
  }

  private isRateCapped(now: number): boolean {
    while (this.sentAtWindow.length > 0 && now - this.sentAtWindow[0] >= this.dedupWindowMs) {
      this.sentAtWindow.shift();
    }
    if (this.sentAtWindow.length >= this.maxPerWindow) return true;
    this.sentAtWindow.push(now);
    return false;
  }

  private remember(source: string, message: string, delivered: boolean, now: number): void {
    this.recent.unshift({
      at: new Date(now).toISOString(),
      source,
      message,
      delivered,
    });
    if (this.recent.length > RECENT_LIMIT) this.recent.length = RECENT_LIMIT;
  }

  /** Keep dedup keys stable: strip query strings, UUIDs and numeric ids. */
  private stableMessage(message: string): string {
    return message
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
      .replace(/\b\d{4,}\b/g, ':n')
      .slice(0, 500);
  }

  private positiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }
}
