import { Injectable } from '@nestjs/common';

type RequestMetric = {
  count: number;
  errorCount: number;
  durationSeconds: number;
  buckets: number[];
};

const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly requests = new Map<string, RequestMetric>();

  recordRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const normalizedMethod = method.toUpperCase();
    const normalizedRoute = this.normalizeRoute(route);
    const status = String(statusCode || 500);
    const key = `${normalizedMethod}\u0000${normalizedRoute}\u0000${status}`;
    const durationSeconds = Math.max(0, durationMs) / 1000;
    const metric = this.requests.get(key) ?? {
      count: 0,
      errorCount: 0,
      durationSeconds: 0,
      buckets: BUCKETS.map(() => 0),
    };

    metric.count += 1;
    metric.errorCount += statusCode >= 500 ? 1 : 0;
    metric.durationSeconds += durationSeconds;
    metric.buckets = metric.buckets.map((value, index) =>
      durationSeconds <= BUCKETS[index] ? value + 1 : value,
    );
    this.requests.set(key, metric);
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP alistore_process_start_time_seconds Unix timestamp of process start.',
      '# TYPE alistore_process_start_time_seconds gauge',
      `alistore_process_start_time_seconds ${(this.startedAt / 1000).toFixed(3)}`,
      '# HELP alistore_http_requests_total Total HTTP requests handled by the API.',
      '# TYPE alistore_http_requests_total counter',
      '# HELP alistore_http_request_errors_total Total HTTP 5xx responses.',
      '# TYPE alistore_http_request_errors_total counter',
      '# HELP alistore_http_request_duration_seconds HTTP request duration.',
      '# TYPE alistore_http_request_duration_seconds histogram',
    ];

    for (const [key, metric] of [...this.requests.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const [method, route, status] = key.split('\u0000');
      const labels = `method="${this.escapeLabel(method)}",route="${this.escapeLabel(route)}",status="${this.escapeLabel(status)}"`;
      lines.push(`alistore_http_requests_total{${labels}} ${metric.count}`);
      lines.push(`alistore_http_request_errors_total{${labels}} ${metric.errorCount}`);
      BUCKETS.forEach((bucket, index) => {
        lines.push(
          `alistore_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${metric.buckets[index]}`,
        );
      });
      lines.push(`alistore_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`);
      lines.push(`alistore_http_request_duration_seconds_sum{${labels}} ${metric.durationSeconds.toFixed(6)}`);
      lines.push(`alistore_http_request_duration_seconds_count{${labels}} ${metric.count}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private normalizeRoute(route: string): string {
    const value = route || '/unknown';
    return value
      .split('?')[0]
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }

  private escapeLabel(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
  }
}
