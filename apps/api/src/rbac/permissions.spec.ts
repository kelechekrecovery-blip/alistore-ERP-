import { APPROVAL_APPROVER_ROLES, Role, canApprove } from './permissions';

/**
 * Locks the authoritative approval matrix. `PATCH /approvals/:id/decide` carries
 * no `@RequirePermission`, so who-may-approve-what rests entirely on `canApprove`
 * (approvals.service.ts) reading APPROVAL_APPROVER_ROLES — NOT the Casbin
 * `*, approve` rows in authz.model.ts, which are a separate matrix that can drift
 * (see BACKLOG LEDGER-HARDEN-33). This test pins the enforced matrix so a refactor
 * cannot silently widen or narrow approval authority for a dangerous action.
 */
describe('canApprove — authoritative approval matrix', () => {
  const ALL_ROLES = Object.values(Role);

  // Exhaustive expected matrix, kept independent of the source object so a typo
  // in APPROVAL_APPROVER_ROLES is caught rather than mirrored.
  const EXPECTED: Record<string, Role[]> = {
    discount: ['senior_seller', 'admin', 'owner'],
    refund: ['admin', 'owner'],
    price: ['admin', 'owner'],
    write_off: ['owner'],
    quarantine_write_off: ['owner'],
    exchange: ['senior_seller', 'admin', 'owner'],
    stock_adjust: ['owner'],
    debt: ['senior_seller', 'admin', 'owner'],
    delete: ['owner'],
    pii: ['admin', 'owner'],
    campaign_budget: ['admin', 'owner'],
    manual_adjustment: ['admin', 'owner'],
  };

  it('covers exactly the actions declared in APPROVAL_APPROVER_ROLES (no drift)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(APPROVAL_APPROVER_ROLES).sort());
  });

  for (const [action, allowed] of Object.entries(EXPECTED)) {
    describe(action, () => {
      for (const role of ALL_ROLES) {
        const shouldAllow = allowed.includes(role);
        it(`${shouldAllow ? 'allows' : 'denies'} ${role}`, () => {
          expect(canApprove(action, role)).toBe(shouldAllow);
        });
      }
    });
  }

  it('denies an unknown action for every role (fail-closed)', () => {
    for (const role of ALL_ROLES) {
      expect(canApprove('not_a_real_action', role)).toBe(false);
    }
  });

  it('never lets seller/cashier/warehouse approve any dangerous action', () => {
    const neverApprovers: Role[] = ['seller', 'cashier', 'warehouse', 'service', 'technician', 'courier', 'marketer'];
    for (const action of Object.keys(EXPECTED)) {
      for (const role of neverApprovers) {
        expect(canApprove(action, role)).toBe(false);
      }
    }
  });
});
