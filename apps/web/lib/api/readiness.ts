import { API_BASE } from './http';

export type ReadinessStatus = 'ready' | 'missing' | 'manual_required' | 'optional';

export interface ExternalReadinessCheck {
  id: string;
  area: string;
  title: string;
  status: ReadinessStatus;
  blocking: boolean;
  requiredEnv: string[];
  optionalEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
  manualChecks: string[];
  note: string;
}

export interface ExternalReadinessReport {
  status: 'ready' | 'blocked';
  generatedAt: string;
  summary: {
    ready: number;
    missing: number;
    manualRequired: number;
    optional: number;
    blockingRemaining: number;
  };
  checks: ExternalReadinessCheck[];
  nextActions: string[];
}

export async function fetchExternalReadiness(): Promise<ExternalReadinessReport> {
  const res = await fetch(`${API_BASE}/health/integrations`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`readiness -> ${res.status}`);
  return (await res.json()) as ExternalReadinessReport;
}
