import { RmaStatus } from '@prisma/client';

export interface SupplierScore {
  supplierId: string;
  supplier: string;
  total: number;
  open: number;
  resolved: number; // repaired + replaced + refunded
  rejected: number;
  resolutionRate: number | null; // resolved / (resolved + rejected)
}

interface SupplierRow {
  id: string;
  name: string;
}
interface RmaRow {
  supplierId: string;
  status: RmaStatus;
  resolution: string | null;
}

const RESOLVED = new Set(['repaired', 'replaced', 'refunded']);

/**
 * Fold RMA rows into one score per supplier. An RMA counts as resolved/rejected by
 * its recorded `resolution` (set once a supplier resolves it); everything without a
 * resolution is still open. Pure — all rows are supplied by the caller.
 */
export function buildScorecard(suppliers: SupplierRow[], rmas: RmaRow[]): SupplierScore[] {
  return suppliers.map((s) => {
    const own = rmas.filter((r) => r.supplierId === s.id);
    const resolved = own.filter((r) => r.resolution && RESOLVED.has(r.resolution)).length;
    const rejected = own.filter((r) => r.resolution === 'rejected').length;
    const open = own.filter((r) => !r.resolution).length;
    const decided = resolved + rejected;
    return {
      supplierId: s.id,
      supplier: s.name,
      total: own.length,
      open,
      resolved,
      rejected,
      resolutionRate: decided > 0 ? Math.round((resolved / decided) * 100) / 100 : null,
    };
  });
}
