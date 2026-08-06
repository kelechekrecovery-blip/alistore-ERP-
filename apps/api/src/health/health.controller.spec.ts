import type { ConfigService } from '@nestjs/config';
import type {
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController integration readiness versions', () => {
  it('keeps v1 on the legacy route and exposes the four-state contract only on v2', async () => {
    const prisma = {
      setting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn((name: string) => ({
        AI_PROVIDER_KEY: 'set',
        AI_PROVIDER_CERTIFIED: 'false',
      })[name]),
    } as unknown as ConfigService;
    const controller = new HealthController(
      {} as HealthCheckService,
      {} as PrismaHealthIndicator,
      {} as MemoryHealthIndicator,
      prisma,
      config,
    );

    const [v1, v2] = await Promise.all([
      controller.integrations(),
      controller.integrationsV2(),
    ]);

    expect(v1).not.toHaveProperty('contractVersion');
    expect(v1.checks.find((check) => check.id === 'ai_provider')?.status)
      .toBe('manual_required');
    expect(v2).toMatchObject({ contractVersion: 2, mode: 'production' });
    expect(v2.checks.find((check) => check.id === 'ai_provider')?.status)
      .toBe('configured');
  });
});
