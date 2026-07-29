import { AuthzService } from '../src/authz/authz.service';

describe('AuthzService (casbin — Role Permission Matrix)', () => {
  const authz = new AuthzService();

  beforeAll(async () => {
    await authz.init();
  });

  it('admin may approve a refund; senior_seller may not', async () => {
    expect(await authz.can('admin', 'refund', 'approve')).toBe(true);
    expect(await authz.can('senior_seller', 'refund', 'approve')).toBe(false);
  });

  it('owner inherits admin + senior_seller permissions', async () => {
    expect(await authz.can('owner', 'refund', 'approve')).toBe(true); // via admin
    expect(await authz.can('owner', 'discount', 'approve')).toBe(true); // via senior_seller
    expect(await authz.can('owner', 'write_off', 'approve')).toBe(true); // direct
  });

  it('a plain seller may not approve any dangerous action', async () => {
    expect(await authz.can('seller', 'discount', 'approve')).toBe(false);
    expect(await authz.can('seller', 'refund', 'approve')).toBe(false);
    expect(await authz.can('seller', 'write_off', 'approve')).toBe(false);
  });

  it('keeps inventory valuation and GL reconciliation financial', async () => {
    expect(await authz.can('owner', 'finance', 'read')).toBe(true);
    expect(await authz.can('admin', 'finance', 'read')).toBe(true);
    expect(await authz.can('warehouse', 'finance', 'read')).toBe(false);
  });

  it('separates warehouse receiving from procurement financial postings', async () => {
    expect(await authz.can('warehouse', 'procurement', 'receive')).toBe(true);

    for (const [resource, action] of [
      ['accounts_payable', 'pay'],
      ['accounts_payable', 'apply'],
      ['accounts_payable', 'reconcile'],
      ['landed_cost', 'post'],
    ] as const) {
      expect(await authz.can('warehouse', resource, action)).toBe(false);
      expect(await authz.can('admin', resource, action)).toBe(true);
      expect(await authz.can('owner', resource, action)).toBe(true);
    }
  });
});
