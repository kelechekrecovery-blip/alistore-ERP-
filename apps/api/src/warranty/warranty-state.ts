import { WarrantyStatus } from '@prisma/client';
import { ValidationError } from '../common/errors';

/** Warranty case lifecycle (screen «Обращения и гарантия»). */
export const WARRANTY_TRANSITIONS: Record<WarrantyStatus, WarrantyStatus[]> = {
  created: ['received', 'rejected'],
  received: ['diagnostics', 'rejected'],
  diagnostics: ['waiting_supplier', 'approved', 'rejected'],
  waiting_supplier: ['approved', 'rejected'],
  approved: ['repairing', 'repaired', 'replaced'],
  repairing: ['repaired', 'replaced'],
  rejected: ['closed'],
  repaired: ['closed'],
  replaced: ['closed'],
  closed: [],
};

export function assertWarrantyTransition(from: WarrantyStatus, to: WarrantyStatus): void {
  if (!WARRANTY_TRANSITIONS[from]?.includes(to)) {
    throw new ValidationError(
      'illegal_warranty_transition',
      `Недопустимый переход гарантии: ${from} → ${to}`,
    );
  }
}
