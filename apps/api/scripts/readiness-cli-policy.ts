import type { ExternalReadinessReport } from '../src/health/external-readiness';

/** Strict production readiness never accepts the reduced public-demo contour. */
export function strictReadinessExitCode(
  report: ExternalReadinessReport,
  strictExternal: boolean,
): 0 | 1 {
  if (!strictExternal) return 0;
  return report.mode === 'production' && report.status === 'ready' ? 0 : 1;
}
