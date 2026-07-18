import {
  Controller,
  Get,
  Header,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(@Req() request: Request): string {
    this.assertAccess(request);
    return this.metrics.renderPrometheus();
  }

  private assertAccess(request: Request): void {
    if (this.config.get<string>('NODE_ENV') !== 'production') return;

    const configuredToken = this.config.get<string>('METRICS_TOKEN');
    const authorization = request.headers.authorization;
    if (!configuredToken || authorization !== `Bearer ${configuredToken}`) {
      throw new UnauthorizedException('Metrics authorization required');
    }
  }
}
