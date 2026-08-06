import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchExternalReadiness,
  parseExternalReadinessV2,
} from './readiness';
import type { ExternalReadinessCheck, ExternalReadinessReport } from './readiness';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readiness API compatibility', () => {
  it('uses v2 directly when the new API is deployed before the new Web', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(v2Payload()));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchExternalReadiness('token');

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health/integrations/v2'), expect.anything());
    expect(report).toMatchObject({ contractVersion: 2, mode: 'production' });
  });

  it('falls back to and safely normalizes legacy v1 while an old API is still deployed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response(legacyPayload()));
    vi.stubGlobal('fetch', fetchMock);

    const report = await fetchExternalReadiness('token');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({
      contractVersion: 2,
      mode: 'production',
      status: 'blocked',
      sourceContractVersion: 1,
    });
    expect(report.checks[0]).toMatchObject({
      status: 'configured',
      attestationRequired: true,
    });
  });

  it('fails closed on malformed or unknown v2 payloads instead of casting them', () => {
    expect(() => parseExternalReadinessV2({ ...v2Payload(), checks: [{ ...v2Payload().checks[0], status: 'ready' }] }))
      .toThrow('invalid readiness response');
    expect(() => parseExternalReadinessV2({ ...v2Payload(), contractVersion: 3 }))
      .toThrow('invalid readiness response');
    expect(() => parseExternalReadinessV2({ status: 'ready' }))
      .toThrow('invalid readiness response');
  });

  it.each(['certified', 'configured', 'blocked'] as const)(
    'rejects %s rows that still report missing required configuration',
    (status) => {
      const check: ExternalReadinessCheck = {
        ...v2Payload().checks[0],
        status,
        configuredEnv: [],
        missingEnv: ['AI_PROVIDER_KEY'],
      };

      expect(() => parseExternalReadinessV2(payloadFor(check)))
        .toThrow('invalid readiness response');
    },
  );

  it('rejects missing rows that do not identify missing required configuration', () => {
    const check: ExternalReadinessCheck = {
      ...v2Payload().checks[0],
      status: 'missing',
      configuredEnv: [],
      missingEnv: [],
    };

    expect(() => parseExternalReadinessV2(payloadFor(check)))
      .toThrow('invalid readiness response');
  });

  it.each([
    { configuredEnv: ['UNKNOWN_ENV'], missingEnv: [] },
    { configuredEnv: ['AI_PROVIDER_KEY', 'AI_PROVIDER_KEY'], missingEnv: [] },
    { configuredEnv: ['AI_PROVIDER_KEY'], missingEnv: ['AI_PROVIDER_KEY'] },
    { configuredEnv: [], missingEnv: ['UNKNOWN_ENV'] },
    { configuredEnv: [], missingEnv: ['AI_PROVIDER_KEY', 'AI_PROVIDER_KEY'] },
  ])('rejects incoherent configured/missing env sets: %j', (sets) => {
    const check: ExternalReadinessCheck = {
      ...v2Payload().checks[0],
      status: 'configured',
      ...sets,
    };

    expect(() => parseExternalReadinessV2(payloadFor(check)))
      .toThrow('invalid readiness response');
  });

  it.each(['', 'bad-name', 'lowercase_name', ' WITH_SPACE '])(
    'rejects invalid attestation env name %j',
    (attestationEnv) => {
      const check: ExternalReadinessCheck = { ...v2Payload().checks[0], attestationEnv };

      expect(() => parseExternalReadinessV2(payloadFor(check)))
        .toThrow('invalid readiness response');
    },
  );

  it('rejects aggregate mismatches instead of trusting server summary/status', () => {
    const payload = v2Payload();
    payload.summary.blockingRemaining = 0;
    payload.status = 'ready';

    expect(() => parseExternalReadinessV2(payload)).toThrow('invalid readiness response');
  });

  it('accepts a legitimate blocked manual-only row without required env', () => {
    const check: ExternalReadinessCheck = {
      ...v2Payload().checks[0],
      id: 'pos_hardware',
      status: 'blocked',
      requiredEnv: [],
      optionalEnv: [],
      configuredEnv: [],
      missingEnv: [],
      attestationEnv: 'POS_HARDWARE_CERTIFIED',
    };

    expect(parseExternalReadinessV2(payloadFor(check)).checks[0]).toMatchObject({
      id: 'pos_hardware',
      status: 'blocked',
    });
  });
});

function payloadFor(check: ExternalReadinessCheck): ExternalReadinessReport {
  const summary = {
    certified: check.status === 'certified' ? 1 : 0,
    configured: check.status === 'configured' ? 1 : 0,
    missing: check.status === 'missing' ? 1 : 0,
    blocked: check.status === 'blocked' ? 1 : 0,
    blockingRemaining: check.blocking && check.status !== 'certified' ? 1 : 0,
  };
  return {
    ...v2Payload(),
    status: summary.blockingRemaining === 0 ? 'ready' : 'blocked',
    summary,
    checks: [check],
  };
}

function v2Payload(): ExternalReadinessReport {
  return {
    contractVersion: 2,
    mode: 'production',
    status: 'blocked',
    generatedAt: '2026-08-06T00:00:00.000Z',
    summary: { certified: 0, configured: 1, missing: 0, blocked: 0, blockingRemaining: 1 },
    checks: [{
      id: 'ai_provider', area: 'ai', title: 'AI', status: 'configured', blocking: true,
      requiredEnv: ['AI_PROVIDER_KEY'], optionalEnv: [], configuredEnv: ['AI_PROVIDER_KEY'],
      missingEnv: [], attestationRequired: true, attestationEnv: 'AI_PROVIDER_CERTIFIED',
      manualChecks: ['Owner checks provider output'], note: 'Operator attestation required.',
    }],
    nextActions: ['AI: operator attestation required'],
  };
}

function legacyPayload() {
  return {
    status: 'ready',
    generatedAt: '2026-08-06T00:00:00.000Z',
    summary: { ready: 1, missing: 0, manualRequired: 0, optional: 0, blockingRemaining: 0 },
    checks: [{
      id: 'ai_provider', area: 'ai', title: 'AI', status: 'ready', blocking: true,
      requiredEnv: ['AI_PROVIDER_KEY'], optionalEnv: [], configuredEnv: ['AI_PROVIDER_KEY'],
      missingEnv: [], manualChecks: [], note: 'Legacy report.',
    }],
    nextActions: [],
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
