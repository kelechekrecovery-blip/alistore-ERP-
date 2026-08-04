import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from '../../../../node_modules/rxjs';
import { tap } from '../../../../node_modules/rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; path?: string; route?: { path?: string } }>();
    if (request.path === '/api/metrics' || request.path === '/metrics') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const started = process.hrtime.bigint();
    return next.handle().pipe(
      tap({
        next: () => this.record(request, response, started),
        error: (error: { status?: number }) => this.record(request, response, started, error.status),
      }),
    );
  }

  private record(
    request: { method?: string; path?: string; route?: { path?: string } },
    response: { statusCode?: number },
    started: bigint,
    errorStatus?: number,
  ): void {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    this.metrics.recordRequest(
      request.method ?? 'UNKNOWN',
      request.route?.path ?? request.path ?? '/unknown',
      errorStatus ?? response.statusCode ?? 200,
      durationMs,
    );
  }
}
