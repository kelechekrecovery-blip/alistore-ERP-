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
  }])],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
