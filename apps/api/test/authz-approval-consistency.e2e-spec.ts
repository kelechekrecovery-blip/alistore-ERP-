import { AuthzService } from '../src/authz/authz.service';
import { APPROVAL_APPROVER_ROLES, Role, canApprove } from '../src/rbac/permissions';

/**
 * Two authorization matrices describe who may approve a dangerous action:
 *  - `APPROVAL_APPROVER_ROLES` / `canApprove` (rbac/permissions.ts) — the one the
 *    decide path actually enforces (approvals.service.ts), and
 *  - the Casbin `p, <role>, <action>, approve` rows (authz.model.ts), reachable
 *    via `@RequirePermission(<action>, 'approve')` on any future route.
 * They historically drifted (BACKLOG LEDGER-HARDEN-33: `writeoff` vs `write_off`,
 * missing quarantine_write_off/exchange/campaign_budget). This test pins them to
 * agree — for every approval action and every role, Casbin (with owner→admin→
 * senior_seller inheritance) must grant exactly what `canApprove` grants — so the
 * two can never silently diverge again.
 */
describe('authz: Casbin approve rows == canApprove matrix', () => {
  let authz: AuthzService;
  const ALL_ROLES = Object.values(Role);
  const ACTIONS = Object.keys(APPROVAL_APPROVER_ROLES);

  beforeAll(async () => {
    authz = new AuthzService();
    await authz.init();
  });

  for (const action of ACTIONS) {
    describe(action, () => {
      for (const role of ALL_ROLES) {
        it(`agrees for ${role}`, async () => {
          const casbin = await authz.can(role, action, 'approve');
          expect(casbin).toBe(canApprove(action, role));
        });
      }
    });
  }
});
