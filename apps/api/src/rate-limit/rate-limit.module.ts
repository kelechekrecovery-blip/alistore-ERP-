import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

/**
 * Shared request throttling for public write endpoints. Route decorators set the
 * tighter product-specific caps; this default is only a fallback.
 */
@Module({
  imports: [ThrottlerModule.forRoot([{
    ttl: 60_000,
    limit: 100,
    skipIf: () => process.env.E2E_TEST === 'true',
    getTracker: trackRequestSubject,
  }])],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}

/**
 * По кому считаем лимит.
 *
 * Дефолт библиотеки — `req.ip`, и этого мало в обе стороны. За обратным прокси
 * без `trust proxy` он одинаков для всех (см. `resolveTrustProxy`), а с ним —
 * аутентифицированный злоумышленник уходит от лимита, меняя адрес. Поэтому:
 * есть субъект в токене — считаем по субъекту, нет — по адресу.
 *
 * Префиксы обязательны: без них клиент с IP, совпавшим со строкой id, попал бы
 * в чужой бакет.
 */
export async function trackRequestSubject(req: Record<string, unknown>): Promise<string> {
  const user = req.user as { customerId?: string } | undefined;
  const subject = user?.customerId;
  if (typeof subject === 'string' && subject.length > 0) {
    return `sub:${subject}`;
  }
  return `ip:${String(req.ip ?? 'unknown')}`;
}
