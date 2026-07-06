/**
 * Role Permission Matrix / Approval Rules Matrix (reference/api-and-events.md).
 * Pure policy — no I/O. Enforced on the server: who may APPROVE each dangerous
 * action, the thresholds beyond which an action becomes approval-gated, and each
 * role's direct (no-approval) discount limit.
 *
 * Role is defined here (not imported from Prisma): the schema's Role enum isn't
 * referenced by any model, so Prisma doesn't generate it. This is the single
 * source of truth for staff roles until auth carries them.
 */
export const Role = {
  seller: 'seller',
  senior_seller: 'senior_seller',
  cashier: 'cashier',
  warehouse: 'warehouse',
  courier: 'courier',
  marketer: 'marketer',
  admin: 'admin',
  owner: 'owner',
  franchise: 'franchise',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Who may approve each dangerous action. */
export const APPROVAL_APPROVER_ROLES: Record<string, Role[]> = {
  discount: ['senior_seller', 'admin', 'owner'],
  refund: ['admin', 'owner'],
  price: ['admin', 'owner'],
  write_off: ['owner'],
  stock_adjust: ['owner'],
  debt: ['senior_seller', 'admin', 'owner'],
  delete: ['owner'],
  pii: ['admin', 'owner'],
};

/** Thresholds beyond which an action must be parked for approval. */
export const APPROVAL_THRESHOLDS = {
  discountPct: 10, // скидка > 10%
  priceChangePct: 15, // изменение цены > ±15%
} as const;

/** Max discount a role may apply directly, without approval (%). */
export const ROLE_DISCOUNT_LIMIT_PCT: Record<Role, number> = {
  seller: 5,
  senior_seller: 15,
  cashier: 5,
  warehouse: 0,
  courier: 0,
  marketer: 0,
  admin: 100,
  owner: 100,
  franchise: 20,
};

/** May this role approve this action? */
export function canApprove(action: string, role: Role): boolean {
  return APPROVAL_APPROVER_ROLES[action]?.includes(role) ?? false;
}

/** May this role apply this discount % directly (no approval)? */
export function canDiscountDirectly(role: Role, pct: number): boolean {
  return pct <= (ROLE_DISCOUNT_LIMIT_PCT[role] ?? 0);
}
