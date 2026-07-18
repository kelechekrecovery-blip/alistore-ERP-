import { Controller, Get, INestApplication, NotFoundException } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AlerterService } from '../src/observability/alerter.service';
import { ErrorReporter } from '../src/observability/error-reporter';
import { SentryExceptionFilter } from '../src/observability/sentry-exception.filter';

@Controller('alert-probe')
class AlertProbeController {
  @Get('boom')
  boom(): never {
    throw new Error('kaboom');
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException('no such thing');
  }
}

describe('Critical-alert exception filter wiring', () => {
  let app: INestApplication;
  const alerter = { notifyCritical: jest.fn() };
  const reporter = { capture: jest.fn(), enabled: false };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AlertProbeController],
      providers: [
        { provide: ErrorReporter, useValue: reporter },
        { provide: AlerterService, useValue: alerter },
        { provide: APP_FILTER, useClass: SentryExceptionFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    alerter.notifyCritical.mockClear();
    reporter.capture.mockClear();
  });

  it('pages the alert channel on an unhandled 500 and still reports to Sentry', async () => {
    await request(app.getHttpServer()).get('/alert-probe/boom').expect(500);

    expect(reporter.capture).toHaveBeenCalledTimes(1);
    expect(alerter.notifyCritical).toHaveBeenCalledTimes(1);
    const [alert] = alerter.notifyCritical.mock.calls[0];
    expect(alert.source).toBe('api');
    expect(alert.message).toContain('GET /alert-probe/boom');
    expect(alert.error).toBeInstanceOf(Error);
  });

  it('does not page on expected 4xx responses', async () => {
    await request(app.getHttpServer()).get('/alert-probe/missing').expect(404);
    await request(app.getHttpServer()).get('/no-such-route').expect(404);

    expect(reporter.capture).toHaveBeenCalledTimes(2);
    expect(alerter.notifyCritical).not.toHaveBeenCalled();
  });
});
