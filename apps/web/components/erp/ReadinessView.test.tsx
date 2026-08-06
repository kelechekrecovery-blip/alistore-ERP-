import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalReadinessReport } from '../../lib/api/readiness';

vi.mock('./Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

import { ReadinessView } from './ReadinessView';

describe('ReadinessView', () => {
  it('renders configured and certified as distinct states without rendering values', () => {
    const report: ExternalReadinessReport = {
      contractVersion: 2,
      mode: 'production',
      status: 'blocked',
      generatedAt: '2026-08-06T00:00:00.000Z',
      summary: {
        certified: 1,
        configured: 1,
        missing: 0,
        blocked: 0,
        blockingRemaining: 1,
      },
      checks: [
        check({
          id: 'native_push_ios',
          title: 'iOS APNs delivery',
          status: 'configured',
          attestationRequired: true,
          attestationEnv: 'APNS_CERTIFIED',
          configuredEnv: ['APNS_KEY_ID', 'APNS_TEAM_ID'],
        }),
        check({
          id: 'meilisearch',
          title: 'Meilisearch acceleration',
          status: 'certified',
          attestationRequired: true,
          attestationEnv: 'MEILISEARCH_CERTIFIED',
          configuredEnv: ['MEILI_HOST', 'MEILI_API_KEY'],
        }),
      ],
      nextActions: [],
    };

    const html = renderToStaticMarkup(<ReadinessView report={report} error="" />);

    expect(html).toContain('Certified');
    expect(html).toContain('Configured');
    expect(html).toContain('iOS APNs delivery');
    expect(html).toContain('APNS_CERTIFIED');
    expect(html).toContain('Meilisearch acceleration');
    expect(html).toContain('launch:readiness:strict');
    expect(html).not.toContain('apns-private-key-value');
    expect(html).not.toContain('meili-master-key-value');
  });

  it('labels demo contour explicitly and never calls it production-ready', () => {
    const report: ExternalReadinessReport = {
      contractVersion: 2,
      mode: 'demo',
      status: 'ready',
      generatedAt: '2026-08-06T00:00:00.000Z',
      summary: { certified: 0, configured: 0, missing: 0, blocked: 0, blockingRemaining: 0 },
      checks: [],
      nextActions: [],
    };

    const html = renderToStaticMarkup(<ReadinessView report={report} error="" />);

    expect(html).toContain('Демо-контур');
    expect(html).not.toContain('Готово к запуску');
    expect(html).not.toContain('Production readiness');
  });
});

function check(overrides: Partial<ExternalReadinessReport['checks'][number]>) {
  return {
    id: 'check',
    area: 'production',
    title: 'Check',
    status: 'missing' as const,
    blocking: true,
    requiredEnv: [],
    optionalEnv: [],
    configuredEnv: [],
    missingEnv: [],
    attestationRequired: false,
    attestationEnv: null,
    manualChecks: [],
    note: 'Secret-safe note.',
    ...overrides,
  } satisfies ExternalReadinessReport['checks'][number];
}
