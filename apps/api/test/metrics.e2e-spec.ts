import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MetricsController } from '../src/observability/metrics.controller';
import { MetricsService } from '../src/observability/metrics.service';

describe('Metrics', () => {
  let app: INestApplication;
  let metrics: MetricsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        { provide: ConfigService, useValue: { get: (name: string) => process.env[name] } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    metrics = moduleRef.get(MetricsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders Prometheus metrics with stable labels and no secrets', async () => {
    metrics.recordRequest('get', '/api/orders/123', 200, 25);
    metrics.recordRequest('post', '/api/orders/550e8400-e29b-41d4-a716-446655440000', 500, 1200);

    const response = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# TYPE alistore_http_requests_total counter');
    expect(response.text).toContain('route="/api/orders/:id"');
    expect(response.text).toContain('status="500"');
    expect(response.text).not.toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('does not create a metric for the metrics scrape itself', async () => {
    const before = metrics.renderPrometheus();
    await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(metrics.renderPrometheus()).toBe(before);
  });
});
